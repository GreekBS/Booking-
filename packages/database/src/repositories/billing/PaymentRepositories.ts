import { Prisma } from "@prisma/client";
import { withTenantTransaction } from "../../client";
import {
  Payment,
  PaymentAllocation,
  PaymentAllocationReversal,
  Refund,
  isSettleable,
  computePaymentAvailability,
  assertCanAllocatePayment,
  assertCanRefund,
  assertCanReverse,
  ValidationError,
  type PaymentStatus,
  type PaymentMethod,
  type CollectionSource,
  type RefundStatus,
  type IPaymentRepository,
  type IPaymentSettlementRepository,
  type RecordPaymentAtomicCommand,
  type AllocatePaymentAtomicCommand,
  type ReverseAllocationAtomicCommand,
  type RefundAtomicCommand,
  type PaymentSettlementView,
  type FolioSettlementSums,
  type SettlementAmountLine,
  type SettlementRefundLine,
  type AuditEntry,
} from "@hcp/domain";
import { PrismaOutboxRepository } from "../OutboxRepository";

type PaymentRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  currency: string;
  amount: Prisma.Decimal;
  status: string;
  method: string;
  collectionSource: string;
  externalReference: string | null;
  payerName: string | null;
  bookingId: string | null;
  idempotencyKey: string;
  metadata: Prisma.JsonValue;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function mapPayment(row: PaymentRow): Payment {
  return Payment.rehydrate({
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    currency: row.currency,
    amount: row.amount.toFixed(4),
    status: row.status as PaymentStatus,
    method: row.method as PaymentMethod,
    collectionSource: row.collectionSource as CollectionSource,
    externalReference: row.externalReference,
    payerName: row.payerName,
    bookingId: row.bookingId,
    idempotencyKey: row.idempotencyKey,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    receivedAt: row.receivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function paymentCreateData(payment: Payment): Prisma.PaymentCreateInput {
  const p = payment.toProps();
  return {
    id: p.id,
    tenant: { connect: { id: p.tenantId } },
    property: { connect: { id: p.propertyId } },
    currency: p.currency,
    amount: new Prisma.Decimal(p.amount),
    status: p.status,
    method: p.method,
    collectionSource: p.collectionSource,
    externalReference: p.externalReference,
    payerName: p.payerName,
    ...(p.bookingId ? { booking: { connect: { id: p.bookingId } } } : {}),
    idempotencyKey: p.idempotencyKey,
    metadata: p.metadata as Prisma.InputJsonValue,
    receivedAt: p.receivedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function allocationCreateData(
  allocation: PaymentAllocation,
): Prisma.PaymentAllocationCreateManyInput {
  const p = allocation.toProps();
  return {
    id: p.id,
    tenantId: p.tenantId,
    paymentId: p.paymentId,
    folioId: p.folioId,
    allocatedAmount: new Prisma.Decimal(p.allocatedAmount),
    currency: p.currency,
    createdAt: p.createdAt,
    createdByActorId: p.createdByActorId,
    reason: p.reason,
    metadata: p.metadata as Prisma.InputJsonValue,
  };
}

function reversalCreateData(
  reversal: PaymentAllocationReversal,
): Prisma.PaymentAllocationReversalCreateManyInput {
  const p = reversal.toProps();
  return {
    id: p.id,
    tenantId: p.tenantId,
    paymentId: p.paymentId,
    allocationId: p.allocationId,
    reversedAmount: new Prisma.Decimal(p.reversedAmount),
    currency: p.currency,
    reason: p.reason,
    createdAt: p.createdAt,
    createdByActorId: p.createdByActorId,
    metadata: p.metadata as Prisma.InputJsonValue,
    idempotencyKey: null,
  };
}

function refundCreateData(
  refund: Refund,
  createdByActorId?: string | null,
): Prisma.PaymentRefundCreateInput {
  const p = refund.toProps();
  return {
    id: p.id,
    tenant: { connect: { id: p.tenantId } },
    payment: { connect: { id: p.paymentId } },
    amount: new Prisma.Decimal(p.amount),
    currency: p.currency,
    status: p.status,
    reason: p.reason,
    externalReference: p.externalReference,
    idempotencyKey: p.idempotencyKey,
    metadata: p.metadata as Prisma.InputJsonValue,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdByActorId: createdByActorId ?? null,
  };
}

function paymentMatchesIdempotency(existing: PaymentRow, payment: Payment): boolean {
  const p = payment.toProps();
  return (
    existing.amount.toFixed(4) === p.amount &&
    existing.currency === p.currency &&
    existing.method === p.method &&
    existing.collectionSource === p.collectionSource &&
    existing.propertyId === p.propertyId &&
    (existing.bookingId ?? null) === (p.bookingId ?? null)
  );
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  auditEntry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: auditEntry.tenantId,
      actorId: auditEntry.actorId,
      action: auditEntry.action,
      resourceType: auditEntry.resourceType,
      resourceId: auditEntry.resourceId,
      metadata: auditEntry.metadata as Prisma.InputJsonValue,
      ipAddress: auditEntry.ipAddress,
    },
  });
}

async function lockPaymentForUpdate(
  tx: Prisma.TransactionClient,
  tenantId: string,
  paymentId: string,
): Promise<PaymentRow> {
  const locked = await tx.$queryRaw<PaymentRow[]>`
    SELECT
      id,
      tenant_id AS "tenantId",
      property_id AS "propertyId",
      currency,
      amount,
      status,
      method,
      collection_source AS "collectionSource",
      external_reference AS "externalReference",
      payer_name AS "payerName",
      booking_id AS "bookingId",
      idempotency_key AS "idempotencyKey",
      metadata,
      received_at AS "receivedAt",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM payments
    WHERE tenant_id = ${tenantId}::uuid AND id = ${paymentId}::uuid
    FOR UPDATE
  `;
  const row = locked[0];
  if (!row) {
    throw new ValidationError("Payment not found");
  }
  return row;
}

async function lockFoliosForUpdate(
  tx: Prisma.TransactionClient,
  tenantId: string,
  folioIds: string[],
): Promise<Map<string, { currency: string; bookingId: string }>> {
  if (folioIds.length === 0) return new Map();
  const sorted = [...new Set(folioIds)].sort();
  const locked = await tx.$queryRaw<
    Array<{ id: string; currency: string; booking_id: string }>
  >`
    SELECT id, currency, booking_id
    FROM folios
    WHERE tenant_id = ${tenantId}::uuid
      AND id IN (${Prisma.join(sorted.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY id
    FOR UPDATE
  `;
  if (locked.length !== sorted.length) {
    throw new ValidationError("One or more folios not found for allocation lock");
  }
  return new Map(
    locked.map((r) => [
      r.id,
      { currency: r.currency, bookingId: r.booking_id },
    ]),
  );
}

async function assertFolioMatchesPaymentProperty(
  tx: Prisma.TransactionClient,
  tenantId: string,
  folioBookingId: string,
  paymentPropertyId: string,
): Promise<void> {
  const booking = await tx.$queryRaw<Array<{ property_id: string }>>`
    SELECT property_id
    FROM bookings
    WHERE tenant_id = ${tenantId}::uuid AND id = ${folioBookingId}::uuid
    FOR UPDATE
  `;
  const row = booking[0];
  if (!row) {
    throw new ValidationError("Booking not found for folio allocation");
  }
  if (row.property_id !== paymentPropertyId) {
    throw new ValidationError("Cannot allocate Payment across properties");
  }
}

async function loadSettlementLines(
  tx: Prisma.TransactionClient,
  tenantId: string,
  paymentId: string,
): Promise<{
  allocations: SettlementAmountLine[];
  reversals: SettlementAmountLine[];
  refunds: SettlementRefundLine[];
}> {
  const [allocRows, reversalRows, refundRows] = await Promise.all([
    tx.paymentAllocation.findMany({ where: { tenantId, paymentId } }),
    tx.paymentAllocationReversal.findMany({ where: { tenantId, paymentId } }),
    tx.paymentRefund.findMany({ where: { tenantId, paymentId } }),
  ]);
  return {
    allocations: allocRows.map((r) => ({
      amount: r.allocatedAmount.toFixed(4),
      currency: r.currency,
    })),
    reversals: reversalRows.map((r) => ({
      amount: r.reversedAmount.toFixed(4),
      currency: r.currency,
    })),
    refunds: refundRows.map((r) => ({
      amount: r.amount.toFixed(4),
      currency: r.currency,
      status: r.status as RefundStatus,
    })),
  };
}

function assertPaymentSettleable(status: string): void {
  if (!isSettleable(status as PaymentStatus)) {
    throw new ValidationError("Only SUCCEEDED payments can be allocated or refunded");
  }
}

export class PrismaPaymentRepository implements IPaymentRepository {
  async saveNew(payment: Payment): Promise<void> {
    const p = payment.toProps();
    await withTenantTransaction(p.tenantId, async (tx) => {
      await tx.payment.create({ data: paymentCreateData(payment) });
    });
  }

  async findById(tenantId: string, id: string): Promise<Payment | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.payment.findFirst({ where: { tenantId, id } });
      return row ? mapPayment(row) : null;
    });
  }

  async findByIdempotencyKey(
    tenantId: string,
    key: string,
  ): Promise<Payment | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.payment.findFirst({
        where: { tenantId, idempotencyKey: key },
      });
      return row ? mapPayment(row) : null;
    });
  }

  async listByTenant(
    tenantId: string,
    opts?: { limit?: number; bookingId?: string; propertyId?: string },
  ): Promise<Payment[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.payment.findMany({
        where: {
          tenantId,
          ...(opts?.bookingId ? { bookingId: opts.bookingId } : {}),
          ...(opts?.propertyId ? { propertyId: opts.propertyId } : {}),
        },
        orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
        take: opts?.limit ?? 100,
      });
      return rows.map(mapPayment);
    });
  }

  async listByBooking(tenantId: string, bookingId: string): Promise<Payment[]> {
    return this.listByTenant(tenantId, { bookingId });
  }
}

export class PrismaPaymentSettlementRepository
  implements IPaymentSettlementRepository
{
  private readonly outbox = new PrismaOutboxRepository();

  async recordPaymentAtomic(
    command: RecordPaymentAtomicCommand,
  ): Promise<Payment> {
    const tenantId = command.payment.tenantId;
    const key = command.payment.idempotencyKey;

    try {
      return await withTenantTransaction(tenantId, async (tx) => {
        const existing = await tx.payment.findFirst({
          where: { tenantId, idempotencyKey: key },
        });
        if (existing) {
          if (!paymentMatchesIdempotency(existing, command.payment)) {
            throw new ValidationError("Conflicting idempotency key for payment");
          }
          return mapPayment(existing);
        }

        const paymentProps = command.payment.toProps();

        // Property must belong to tenant.
        const propertyOk = await tx.property.findFirst({
          where: {
            id: paymentProps.propertyId,
            tenantId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!propertyOk) {
          throw new ValidationError("Property not found for payment");
        }

        if (paymentProps.bookingId) {
          const booking = await tx.booking.findFirst({
            where: { id: paymentProps.bookingId, tenantId },
            select: { propertyId: true },
          });
          if (!booking) {
            throw new ValidationError("Booking not found for payment");
          }
          if (booking.propertyId !== paymentProps.propertyId) {
            throw new ValidationError(
              "Payment propertyId must match Booking.propertyId",
            );
          }
        }

        await tx.payment.create({ data: paymentCreateData(command.payment) });

        if (command.initialAllocations?.length) {
          const paymentRow = await lockPaymentForUpdate(
            tx,
            tenantId,
            command.payment.id,
          );
          assertPaymentSettleable(paymentRow.status);

          const folioIds = command.initialAllocations.map((a) => a.folioId);
          const folioMap = await lockFoliosForUpdate(tx, tenantId, folioIds);

          let lines = await loadSettlementLines(tx, tenantId, command.payment.id);
          for (const allocation of command.initialAllocations) {
            const ap = allocation.toProps();
            const folio = folioMap.get(ap.folioId);
            if (!folio) {
              throw new ValidationError("Folio not found for allocation");
            }
            if (folio.currency !== ap.currency) {
              throw new ValidationError("Folio currency mismatch for allocation");
            }
            await assertFolioMatchesPaymentProperty(
              tx,
              tenantId,
              folio.bookingId,
              paymentRow.propertyId,
            );
            const availability = computePaymentAvailability({
              amount: paymentRow.amount.toFixed(4),
              currency: paymentRow.currency,
              allocations: lines.allocations,
              reversals: lines.reversals,
              refunds: lines.refunds,
            });
            assertCanAllocatePayment(
              availability.availableToAllocate,
              ap.allocatedAmount,
              ap.currency,
            );
            await tx.paymentAllocation.create({
              data: allocationCreateData(allocation),
            });
            lines = {
              ...lines,
              allocations: [
                ...lines.allocations,
                { amount: ap.allocatedAmount, currency: ap.currency },
              ],
            };
          }
        }

        await this.outbox.saveEvents(command.domainEvents, tx);
        await writeAudit(tx, command.auditEntry);

        const row = await tx.payment.findFirstOrThrow({
          where: { id: command.payment.id, tenantId },
        });
        return mapPayment(row);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await withTenantTransaction(tenantId, async (tx) =>
          tx.payment.findFirst({
            where: { tenantId, idempotencyKey: key },
          }),
        );
        if (existing && paymentMatchesIdempotency(existing, command.payment)) {
          return mapPayment(existing);
        }
        throw new ValidationError("Conflicting idempotency key for payment");
      }
      throw error;
    }
  }

  async allocateAtomic(
    command: AllocatePaymentAtomicCommand,
  ): Promise<PaymentAllocation> {
    const ap = command.allocation.toProps();
    const tenantId = ap.tenantId;

    return withTenantTransaction(tenantId, async (tx) => {
      const paymentRow = await lockPaymentForUpdate(tx, tenantId, ap.paymentId);
      assertPaymentSettleable(paymentRow.status);

      const folioMap = await lockFoliosForUpdate(tx, tenantId, [ap.folioId]);
      const folio = folioMap.get(ap.folioId);
      if (!folio) {
        throw new ValidationError("Folio not found");
      }
      if (folio.currency !== ap.currency) {
        throw new ValidationError("Folio currency mismatch for allocation");
      }
      await assertFolioMatchesPaymentProperty(
        tx,
        tenantId,
        folio.bookingId,
        paymentRow.propertyId,
      );

      const lines = await loadSettlementLines(tx, tenantId, ap.paymentId);
      const availability = computePaymentAvailability({
        amount: paymentRow.amount.toFixed(4),
        currency: paymentRow.currency,
        allocations: lines.allocations,
        reversals: lines.reversals,
        refunds: lines.refunds,
      });
      assertCanAllocatePayment(
        availability.availableToAllocate,
        ap.allocatedAmount,
        ap.currency,
      );

      await tx.paymentAllocation.create({
        data: allocationCreateData(command.allocation),
      });
      await this.outbox.saveEvents(command.domainEvents, tx);
      await writeAudit(tx, command.auditEntry);

      return command.allocation;
    });
  }

  async reverseAllocationAtomic(
    command: ReverseAllocationAtomicCommand,
  ): Promise<PaymentAllocationReversal> {
    const rp = command.reversal.toProps();
    const tenantId = rp.tenantId;

    return withTenantTransaction(tenantId, async (tx) => {
      await lockPaymentForUpdate(tx, tenantId, rp.paymentId);

      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          allocated_amount: Prisma.Decimal;
          currency: string;
          payment_id: string;
        }>
      >`
        SELECT id, allocated_amount, currency, payment_id
        FROM payment_allocations
        WHERE tenant_id = ${tenantId}::uuid AND id = ${rp.allocationId}::uuid
        FOR UPDATE
      `;
      const allocation = locked[0];
      if (!allocation) {
        throw new ValidationError("Payment allocation not found");
      }
      if (allocation.payment_id !== rp.paymentId) {
        throw new ValidationError("Allocation does not belong to payment");
      }

      const existingReversals = await tx.paymentAllocationReversal.findMany({
        where: { tenantId, allocationId: rp.allocationId },
      });
      const reversalLines: SettlementAmountLine[] = existingReversals.map((r) => ({
        amount: r.reversedAmount.toFixed(4),
        currency: r.currency,
      }));

      assertCanReverse(
        allocation.allocated_amount.toFixed(4),
        reversalLines,
        rp.reversedAmount,
        rp.currency,
      );

      await tx.paymentAllocationReversal.create({
        data: reversalCreateData(command.reversal),
      });
      await this.outbox.saveEvents(command.domainEvents, tx);
      await writeAudit(tx, command.auditEntry);

      return command.reversal;
    });
  }

  async refundAtomic(command: RefundAtomicCommand): Promise<Refund> {
    const rp = command.refund.toProps();
    const tenantId = rp.tenantId;
    const key = rp.idempotencyKey;

    try {
      return await withTenantTransaction(tenantId, async (tx) => {
        const paymentRow = await lockPaymentForUpdate(tx, tenantId, rp.paymentId);
        assertPaymentSettleable(paymentRow.status);

        if (command.fifoReversals?.length) {
          for (const reversal of command.fifoReversals) {
            const rev = reversal.toProps();
            const locked = await tx.$queryRaw<
              Array<{ id: string; allocated_amount: Prisma.Decimal; currency: string }>
            >`
              SELECT id, allocated_amount, currency
              FROM payment_allocations
              WHERE tenant_id = ${tenantId}::uuid AND id = ${rev.allocationId}::uuid
              FOR UPDATE
            `;
            const allocation = locked[0];
            if (!allocation) {
              throw new ValidationError("Payment allocation not found for FIFO reversal");
            }
            const existingReversals = await tx.paymentAllocationReversal.findMany({
              where: { tenantId, allocationId: rev.allocationId },
            });
            assertCanReverse(
              allocation.allocated_amount.toFixed(4),
              existingReversals.map((r) => ({
                amount: r.reversedAmount.toFixed(4),
                currency: r.currency,
              })),
              rev.reversedAmount,
              rev.currency,
            );
            await tx.paymentAllocationReversal.create({
              data: reversalCreateData(reversal),
            });
          }
        }

        const lines = await loadSettlementLines(tx, tenantId, rp.paymentId);
        const availability = computePaymentAvailability({
          amount: paymentRow.amount.toFixed(4),
          currency: paymentRow.currency,
          allocations: lines.allocations,
          reversals: lines.reversals,
          refunds: lines.refunds,
        });
        assertCanRefund(availability.refundable, rp.amount, rp.currency);

        await tx.paymentRefund.create({
          data: refundCreateData(
            command.refund,
            command.auditEntry.actorId ?? null,
          ),
        });
        await this.outbox.saveEvents(command.domainEvents, tx);
        await writeAudit(tx, command.auditEntry);

        return command.refund;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await withTenantTransaction(tenantId, async (tx) =>
          tx.paymentRefund.findFirst({
            where: { tenantId, idempotencyKey: key },
          }),
        );
        if (
          existing &&
          existing.amount.toFixed(4) === rp.amount &&
          existing.currency === rp.currency &&
          existing.paymentId === rp.paymentId &&
          existing.status === rp.status
        ) {
          return Refund.rehydrate({
            id: existing.id,
            tenantId: existing.tenantId,
            paymentId: existing.paymentId,
            amount: existing.amount.toFixed(4),
            currency: existing.currency,
            status: existing.status as RefundStatus,
            reason: existing.reason,
            idempotencyKey: existing.idempotencyKey,
            externalReference: existing.externalReference,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
            metadata: (existing.metadata as Record<string, unknown>) ?? {},
          });
        }
        throw new ValidationError("Conflicting idempotency key for refund");
      }
      throw error;
    }
  }

  async getPaymentSettlementView(
    tenantId: string,
    paymentId: string,
  ): Promise<PaymentSettlementView | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.payment.findFirst({ where: { tenantId, id: paymentId } });
      if (!row) return null;

      const [allocRows, reversalRows, refundRows] = await Promise.all([
        tx.paymentAllocation.findMany({
          where: { tenantId, paymentId },
          orderBy: { createdAt: "asc" },
        }),
        tx.paymentAllocationReversal.findMany({
          where: { tenantId, paymentId },
          orderBy: { createdAt: "asc" },
        }),
        tx.paymentRefund.findMany({
          where: { tenantId, paymentId },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      const allocations = allocRows.map((r) =>
        PaymentAllocation.rehydrate({
          id: r.id,
          tenantId: r.tenantId,
          paymentId: r.paymentId,
          folioId: r.folioId,
          allocatedAmount: r.allocatedAmount.toFixed(4),
          currency: r.currency,
          createdAt: r.createdAt,
          createdByActorId: r.createdByActorId,
          reason: r.reason,
          metadata: (r.metadata as Record<string, unknown>) ?? {},
        }),
      );
      const reversals = reversalRows.map((r) =>
        PaymentAllocationReversal.rehydrate({
          id: r.id,
          tenantId: r.tenantId,
          paymentId: r.paymentId,
          allocationId: r.allocationId,
          reversedAmount: r.reversedAmount.toFixed(4),
          currency: r.currency,
          reason: r.reason,
          createdAt: r.createdAt,
          createdByActorId: r.createdByActorId,
          metadata: (r.metadata as Record<string, unknown>) ?? {},
        }),
      );
      const refunds = refundRows.map((r) =>
        Refund.rehydrate({
          id: r.id,
          tenantId: r.tenantId,
          paymentId: r.paymentId,
          amount: r.amount.toFixed(4),
          currency: r.currency,
          status: r.status as RefundStatus,
          reason: r.reason,
          idempotencyKey: r.idempotencyKey,
          externalReference: r.externalReference,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          metadata: (r.metadata as Record<string, unknown>) ?? {},
        }),
      );

      const settlementLines = {
        allocations: allocations.map((a) => ({
          amount: a.allocatedAmount,
          currency: a.currency,
        })),
        reversals: reversals.map((r) => ({
          amount: r.reversedAmount,
          currency: r.currency,
        })),
        refunds: refunds.map((r) => ({
          amount: r.amount,
          currency: r.currency,
          status: r.status,
        })),
      };

      const availability = computePaymentAvailability({
        amount: row.amount.toFixed(4),
        currency: row.currency,
        ...settlementLines,
      });

      return {
        payment: mapPayment(row),
        allocations,
        reversals,
        refunds,
        availability: {
          allocatedNet: availability.allocatedNet,
          refundedEffective: availability.refundedEffective,
          availableToAllocate: availability.availableToAllocate,
          refundable: availability.refundable,
          currency: availability.currency,
        },
      };
    });
  }

  async getFolioSettlementAmounts(
    tenantId: string,
    folioId: string,
  ): Promise<FolioSettlementSums> {
    return withTenantTransaction(tenantId, async (tx) => {
      const allocations = await tx.paymentAllocation.findMany({
        where: { tenantId, folioId },
      });
      const allocationIds = allocations.map((a) => a.id);
      const reversals =
        allocationIds.length === 0
          ? []
          : await tx.paymentAllocationReversal.findMany({
              where: { tenantId, allocationId: { in: allocationIds } },
            });

      const allocationsToFolio: SettlementAmountLine[] = allocations.map((a) => ({
        amount: a.allocatedAmount.toFixed(4),
        currency: a.currency,
      }));
      const reversalsForThoseAllocations: SettlementAmountLine[] = reversals.map(
        (r) => ({
          amount: r.reversedAmount.toFixed(4),
          currency: r.currency,
        }),
      );

      return { allocationsToFolio, reversalsForThoseAllocations };
    });
  }
}
