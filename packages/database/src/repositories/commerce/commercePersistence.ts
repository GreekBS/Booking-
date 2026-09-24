import type { Hold, Booking, Quote } from "@hcp/domain";
import type { HoldStatus, BookingStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { TransactionClient } from "../OutboxRepository";
import {
  mapCalendarBlockStatusForBooking,
  mapCalendarBlockStatusForHold,
  toDateColumn,
} from "./commerceMappers";

export async function persistHoldTx(tx: TransactionClient, hold: Hold): Promise<void> {
  const checkIn = hold.stayPeriod.checkIn.value;
  const checkOut = hold.stayPeriod.checkOut.value;

  await tx.bookingHold.upsert({
    where: { id: hold.id },
    create: {
      id: hold.id,
      tenantId: hold.tenantId,
      unitId: hold.unitId,
      propertyId: hold.propertyId,
      checkIn: toDateColumn(checkIn),
      checkOut: toDateColumn(checkOut),
      guestCount: hold.guestCount.value,
      status: hold.status as HoldStatus,
      expiresAt: hold.expiresAt,
      idempotencyKey: hold.sessionRef,
    },
    update: {
      guestCount: hold.guestCount.value,
      status: hold.status as HoldStatus,
      expiresAt: hold.expiresAt,
      idempotencyKey: hold.sessionRef,
    },
  });

  await syncHoldCalendarBlockTx(tx, hold, checkIn, checkOut);
}

export async function persistQuoteTx(tx: TransactionClient, quote: Quote): Promise<void> {
  const existing = await tx.quote.findUnique({ where: { id: quote.id } });
  if (existing) {
    return;
  }

  const snapshot = quote.snapshot.toJSON();

  await tx.quote.create({
    data: {
      id: quote.id,
      tenantId: quote.tenantId,
      holdId: quote.holdId,
      unitId: quote.unitId,
      propertyId: quote.propertyId,
      snapshotId: quote.snapshotId,
      snapshot: JSON.parse(
        JSON.stringify({
          ...snapshot,
          quotedAt: snapshot.quotedAt.toISOString(),
        }),
      ) as Prisma.InputJsonValue,
      currency: snapshot.currency,
      totalAmount: snapshot.totalAmount,
      expiresAt: quote.expiresAt,
      createdAt: quote.createdAt,
    },
  });
}

export async function persistBookingTx(tx: TransactionClient, booking: Booking): Promise<void> {
  const checkIn = booking.stayPeriod.checkIn.value;
  const checkOut = booking.stayPeriod.checkOut.value;
  const totalAmount = await resolveBookingTotalAmount(tx, booking);

  const existing = await tx.booking.findUnique({ where: { id: booking.id } });
  const isCreate = !existing;

  if (isCreate) {
    await tx.booking.create({
      data: {
        id: booking.id,
        tenantId: booking.tenantId,
        unitId: booking.unitId,
        propertyId: booking.propertyId,
        quoteId: booking.quoteId,
        holdId: booking.holdId,
        quoteSnapshotId: booking.quoteSnapshotId,
        guestName: booking.guest.name,
        guestEmail: booking.guest.email,
        guestPhone: booking.guest.phone,
        guestCount: booking.guestCount.value,
        checkIn: toDateColumn(checkIn),
        checkOut: toDateColumn(checkOut),
        status: booking.status as BookingStatus,
        confirmationMode: booking.confirmationMode,
        totalAmount,
        currency: await resolveBookingCurrency(tx, booking),
      },
    });
  } else {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        unitId: booking.unitId,
        propertyId: booking.propertyId,
        quoteId: booking.quoteId,
        quoteSnapshotId: booking.quoteSnapshotId,
        guestCount: booking.guestCount.value,
        checkIn: toDateColumn(checkIn),
        checkOut: toDateColumn(checkOut),
        totalAmount,
        currency: await resolveBookingCurrency(tx, booking),
        status: booking.status as BookingStatus,
        guestName: booking.guest.name,
        guestEmail: booking.guest.email,
        guestPhone: booking.guest.phone,
        ...(booking.status === "confirmed" && !existing.confirmedAt
          ? { confirmedAt: new Date() }
          : {}),
        ...(booking.status === "cancelled" && !existing.cancelledAt
          ? { cancelledAt: new Date() }
          : {}),
        ...(booking.status === "completed" && !existing.completedAt
          ? { completedAt: new Date() }
          : {}),
      },
    });
  }

  await syncBookingCalendarBlockTx(tx, booking, checkIn, checkOut, isCreate);
}

async function syncHoldCalendarBlockTx(
  tx: TransactionClient,
  hold: Hold,
  checkIn: string,
  checkOut: string,
): Promise<void> {
  const existing = await tx.unitCalendarBlock.findFirst({
    where: {
      tenantId: hold.tenantId,
      sourceId: hold.id,
      blockType: "hold",
    },
  });

  const blockStatus = mapCalendarBlockStatusForHold(hold.status);

  if (hold.status === "active") {
    const data = {
      tenantId: hold.tenantId,
      unitId: hold.unitId,
      propertyId: hold.propertyId,
      blockType: "hold" as const,
      sourceId: hold.id,
      checkIn: toDateColumn(checkIn),
      checkOut: toDateColumn(checkOut),
      status: blockStatus,
      expiresAt: hold.expiresAt,
    };

    if (existing) {
      await tx.unitCalendarBlock.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await tx.unitCalendarBlock.create({ data });
    }
    return;
  }

  if (existing) {
    await tx.unitCalendarBlock.update({
      where: { id: existing.id },
      data: { status: blockStatus },
    });
  }
}

async function syncBookingCalendarBlockTx(
  tx: TransactionClient,
  booking: Booking,
  checkIn: string,
  checkOut: string,
  isCreate: boolean,
): Promise<void> {
  const existing = await tx.unitCalendarBlock.findFirst({
    where: {
      tenantId: booking.tenantId,
      sourceId: booking.id,
      blockType: "booking",
    },
  });

  const blockStatus = mapCalendarBlockStatusForBooking(booking.status);

  if (isCreate && booking.status !== "cancelled") {
    await tx.unitCalendarBlock.create({
      data: {
        tenantId: booking.tenantId,
        unitId: booking.unitId,
        propertyId: booking.propertyId,
        blockType: "booking",
        sourceId: booking.id,
        checkIn: toDateColumn(checkIn),
        checkOut: toDateColumn(checkOut),
        status: "active",
      },
    });
    return;
  }

  if (existing) {
    await tx.unitCalendarBlock.update({
      where: { id: existing.id },
      data: {
        unitId: booking.unitId,
        propertyId: booking.propertyId,
        checkIn: toDateColumn(checkIn),
        checkOut: toDateColumn(checkOut),
        status: blockStatus,
      },
    });
  }
}

async function resolveBookingTotalAmount(
  tx: TransactionClient,
  booking: Booking,
): Promise<string> {
  const quote = await tx.quote.findUnique({ where: { id: booking.quoteId } });
  return quote?.totalAmount.toString() ?? "0.0000";
}

async function resolveBookingCurrency(tx: TransactionClient, booking: Booking): Promise<string> {
  const quote = await tx.quote.findUnique({ where: { id: booking.quoteId } });
  return quote?.currency.trim() ?? "EUR";
}
