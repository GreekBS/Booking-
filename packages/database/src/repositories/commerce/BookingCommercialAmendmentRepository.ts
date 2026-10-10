import { Prisma } from "@prisma/client";
import {
  BookingCommercialAmendment,
  type BookingCommercialAmendmentInsertResult,
  type IBookingCommercialAmendmentRepository,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";

/**
 * Ambient-TX-safe amendment persistence (BFS-3a).
 * `withTenantTransaction` nests into an active tenant TX for BFS-3b composition.
 */
export class PrismaBookingCommercialAmendmentRepository
  implements IBookingCommercialAmendmentRepository
{
  async insert(
    amendment: BookingCommercialAmendment,
  ): Promise<BookingCommercialAmendmentInsertResult> {
    const props = amendment.toProps();
    try {
      await withTenantTransaction(props.tenantId, async (tx) => {
        await tx.bookingCommercialAmendment.create({
          data: {
            id: props.id,
            tenantId: props.tenantId,
            propertyId: props.propertyId,
            bookingId: props.bookingId,
            previousQuoteId: props.previousQuoteId,
            newQuoteId: props.newQuoteId,
            previousTotalAmount: props.previousTotalAmount,
            newTotalAmount: props.newTotalAmount,
            deltaAmount: props.deltaAmount,
            currency: props.currency,
            pricingIntent: props.pricingIntent,
            reason: props.reason,
            actorId: props.actorId,
            mutationOrigin: props.mutationOrigin,
            confirmationReference: props.confirmationReference,
            idempotencyKey: props.idempotencyKey,
            pricingFingerprint: props.pricingFingerprint,
            createdAt: props.createdAt,
          },
        });
      });
      return { status: "created", amendment };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.findByIdempotencyKey(
          props.tenantId,
          props.idempotencyKey,
        );
        if (!existing) {
          throw error;
        }
        if (amendment.matchesIdempotentPayload(existing)) {
          return { status: "idempotent_hit", amendment: existing };
        }
        return { status: "idempotent_conflict", existing };
      }
      throw error;
    }
  }

  async findByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<BookingCommercialAmendment | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.bookingCommercialAmendment.findUnique({
        where: {
          tenantId_idempotencyKey: { tenantId, idempotencyKey },
        },
      });
      return row ? mapRow(row) : null;
    });
  }

  async listByBookingId(
    tenantId: string,
    bookingId: string,
  ): Promise<BookingCommercialAmendment[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.bookingCommercialAmendment.findMany({
        where: { tenantId, bookingId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(mapRow);
    });
  }
}

function mapRow(row: {
  id: string;
  tenantId: string;
  propertyId: string;
  bookingId: string;
  previousQuoteId: string;
  newQuoteId: string;
  previousTotalAmount: Prisma.Decimal;
  newTotalAmount: Prisma.Decimal;
  deltaAmount: Prisma.Decimal;
  currency: string;
  pricingIntent: string;
  reason: string;
  actorId: string;
  mutationOrigin: string;
  confirmationReference: string;
  idempotencyKey: string;
  pricingFingerprint: string;
  createdAt: Date;
}): BookingCommercialAmendment {
  return BookingCommercialAmendment.rehydrate({
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    bookingId: row.bookingId,
    previousQuoteId: row.previousQuoteId,
    newQuoteId: row.newQuoteId,
    previousTotalAmount: row.previousTotalAmount.toFixed(4),
    newTotalAmount: row.newTotalAmount.toFixed(4),
    deltaAmount: row.deltaAmount.toFixed(4),
    currency: row.currency,
    pricingIntent: row.pricingIntent as "recalculate_from_rate_plan",
    reason: row.reason,
    actorId: row.actorId,
    mutationOrigin: row.mutationOrigin as "operator",
    confirmationReference: row.confirmationReference,
    idempotencyKey: row.idempotencyKey,
    pricingFingerprint: row.pricingFingerprint,
    createdAt: row.createdAt,
  });
}
