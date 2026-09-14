import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PropertyCreatedEvent } from "@hcp/domain";
import { truncateIntegrationTables, prisma } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("OutboxRepository integration", () => {
  const repository = new PrismaOutboxRepository();

  beforeEach(async () => {
    await truncateIntegrationTables();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("saves, finds unprocessed and marks processed events", async () => {
    const aggregateId = "550e8400-e29b-41d4-a716-446655440040";
    const event = new PropertyCreatedEvent(aggregateId, "550e8400-e29b-41d4-a716-446655440041", {
      slug: "test",
      name: "Test",
      defaultUnitId: "550e8400-e29b-41d4-a716-446655440042",
    });

    await repository.saveEvents([event]);

    const unprocessed = await repository.findUnprocessed(10);
    expect(unprocessed.some((e) => e.aggregateId === aggregateId)).toBe(true);

    const record = await prisma.outboxEvent.findFirst({ where: { aggregateId } });
    expect(record).not.toBeNull();

    await repository.markProcessed([record!.id]);

    const after = await prisma.outboxEvent.findFirst({ where: { aggregateId } });
    expect(after?.processedAt).not.toBeNull();
    expect(after?.status).toBe("completed");
  });
});
