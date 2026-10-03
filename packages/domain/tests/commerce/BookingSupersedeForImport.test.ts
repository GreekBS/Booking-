import { describe, expect, it } from "vitest";
import { Booking } from "../../src/commerce/booking/domain/Booking";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import { mutationOriginOperator } from "../../src/shared/types/MutationOrigin";
import {
  createHoldForUnit,
  createQuoteForHold,
  villaProperty,
  HOLD_CREATED_AT,
} from "./fixtures/commerceFixtures";

const bookingNow = new Date(HOLD_CREATED_AT.getTime() + 5 * 60_000);

function createManualBooking(id = "booking-1") {
  const hold = createHoldForUnit(
    villaProperty.units[0].id,
    villaProperty.id,
    "2025-08-01",
    "2025-08-04",
  );
  const quote = createQuoteForHold(hold);
  return Booking.create({
    id,
    hold,
    quote,
    guest: { name: "Jane Doe", email: "jane@example.com", phone: null },
    confirmationMode: "manual",
    now: bookingNow,
  });
}

function completedBooking(id = "booking-completed") {
  const booking = createManualBooking(id);
  booking.confirm(bookingNow, mutationOriginOperator());
  booking.complete(new Date(bookingNow.getTime() + 1000));
  booking.pullDomainEvents();
  return booking;
}

describe("Booking.supersedeForImport", () => {
  it("supersedes a completed booking and records metadata + event", () => {
    const booking = completedBooking();
    const guestBefore = booking.guest;
    const stayBefore = {
      checkIn: booking.stayPeriod.checkIn.value,
      checkOut: booking.stayPeriod.checkOut.value,
      quoteId: booking.quoteId,
    };

    const at = new Date("2026-10-03T12:00:00.000Z");
    booking.supersedeForImport({
      supersededByBookingId: "successor-booking",
      reason: "csv_import_replaced",
      at,
      mutationOrigin: mutationOriginOperator(),
    });

    expect(booking.status).toBe("completed");
    expect(booking.isSuperseded).toBe(true);
    expect(booking.supersededByBookingId).toBe("successor-booking");
    expect(booking.supersededAt?.toISOString()).toBe(at.toISOString());
    expect(booking.supersedeReason).toBe("csv_import_replaced");
    expect(booking.requiresCalendarOccupancyRelease).toBe(true);
    expect(booking.guest).toEqual(guestBefore);
    expect(booking.stayPeriod.checkIn.value).toBe(stayBefore.checkIn);
    expect(booking.stayPeriod.checkOut.value).toBe(stayBefore.checkOut);
    expect(booking.quoteId).toBe(stayBefore.quoteId);
    expect(booking.id).toBe("booking-completed");

    const events = booking.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("BookingSuperseded");
    expect(events[0]!.payload).toMatchObject({
      supersededByBookingId: "successor-booking",
      releaseBookingCalendarOccupancy: true,
      supersedeReason: "csv_import_replaced",
    });
  });

  it("rejects pending / confirmed / cancelled", () => {
    const pending = createManualBooking("pending-1");
    expect(() =>
      pending.supersedeForImport({ supersededByBookingId: "x" }),
    ).toThrow(ConflictError);

    const confirmed = createManualBooking("confirmed-1");
    confirmed.confirm(bookingNow);
    expect(() =>
      confirmed.supersedeForImport({ supersededByBookingId: "x" }),
    ).toThrow(ConflictError);

    const cancelled = createManualBooking("cancelled-1");
    cancelled.cancel("test");
    expect(() =>
      cancelled.supersedeForImport({ supersededByBookingId: "x" }),
    ).toThrow(ConflictError);
  });

  it("rejects already superseded booking", () => {
    const booking = completedBooking("once");
    booking.supersedeForImport({ supersededByBookingId: "s1" });
    expect(() =>
      booking.supersedeForImport({ supersededByBookingId: "s2" }),
    ).toThrow(ConflictError);
  });

  it("rejects empty or self successor id", () => {
    const booking = completedBooking("self-check");
    expect(() =>
      booking.supersedeForImport({ supersededByBookingId: "  " }),
    ).toThrow(ValidationError);
    expect(() =>
      booking.supersedeForImport({ supersededByBookingId: booking.id }),
    ).toThrow(ValidationError);
  });

  it("does not weaken cancel() — completed still cannot cancel", () => {
    const booking = completedBooking("cancel-check");
    expect(() => booking.cancel("nope")).toThrow(ConflictError);
  });

  it("reconstitute defaults missing supersede fields to null", () => {
    const booking = completedBooking("reconstitute-1");
    const reconstituted = Booking.reconstitute({
      id: booking.id,
      tenantId: booking.tenantId,
      unitId: booking.unitId,
      propertyId: booking.propertyId,
      holdId: booking.holdId,
      quoteId: booking.quoteId,
      quoteSnapshotId: booking.quoteSnapshotId,
      checkIn: booking.stayPeriod.checkIn.value,
      checkOut: booking.stayPeriod.checkOut.value,
      guestCount: booking.guestCount.value,
      guest: booking.guest,
      guestId: null,
      status: "completed",
      confirmationMode: "manual",
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      confirmedAt: booking.confirmedAt,
      cancelledAt: null,
      completedAt: booking.completedAt,
      // supersede fields omitted
    });
    expect(reconstituted.isSuperseded).toBe(false);
    expect(reconstituted.supersededByBookingId).toBeNull();
  });
});

describe("Booking.finalizeAsHistoricalImport", () => {
  it("moves pending → confirmed → completed", () => {
    const booking = createManualBooking("hist-1");
    booking.finalizeAsHistoricalImport(bookingNow, mutationOriginOperator());
    expect(booking.status).toBe("completed");
    expect(booking.confirmedAt).not.toBeNull();
    expect(booking.completedAt).not.toBeNull();
  });

  it("is idempotent when already completed", () => {
    const booking = completedBooking("hist-2");
    booking.finalizeAsHistoricalImport(bookingNow);
    expect(booking.status).toBe("completed");
  });
});
