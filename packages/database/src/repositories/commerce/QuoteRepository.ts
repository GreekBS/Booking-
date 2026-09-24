import { Quote, type IQuoteRepository } from "@hcp/domain";
import type { Prisma } from "@prisma/client";
import { withTenantTransaction } from "../../client";
import {
  PrismaOutboxRepository,
  saveAggregateWithOutbox,
  type TransactionClient,
} from "../OutboxRepository";
import { quoteToDomain } from "./commerceMappers";

export class PrismaQuoteRepository implements IQuoteRepository {
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async save(quote: Quote): Promise<void> {
    const events = quote.pullDomainEvents();
    const snapshot = quote.snapshot.toJSON();

    await withTenantTransaction(quote.tenantId, async () => {
      await saveAggregateWithOutbox(this.outboxRepository, events, async (tx) => {
        await this.persistQuote(tx, quote, snapshot);
      });
    });
  }

  async findById(id: string, tenantId: string): Promise<Quote | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.quote.findFirst({
        where: { id, tenantId },
      });
      return record ? quoteToDomain(record) : null;
    });
  }

  private async persistQuote(
    tx: TransactionClient,
    quote: Quote,
    snapshot: ReturnType<Quote["snapshot"]["toJSON"]>,
  ): Promise<void> {
    const existing = await tx.quote.findUnique({ where: { id: quote.id } });
    if (existing) {
      return;
    }

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
}
