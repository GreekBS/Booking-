import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { ConflictError, Hold } from "@hcp/domain";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaCalendarBlockRepository } from "../../src/repositories/commerce/CalendarBlockRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
} from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";
import { runIntegration } from "./integrationGate";


runIntegration("HoldRepository integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const calendarRepository = new PrismaCalendarBlockRepository();

  const tenantId = "550e8400-e29b-41d4-a716-446655442010";
  const propertyId = "550e8400-e29b-41d4-a716-446655442011";
  const unitId = "550e8400-e29b-41d4-a716-446655442012";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("creates hold with active calendar block and outbox event", async () => {
    const holdId = "550e8400-e29b-41d4-a716-446655442013";
    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId,
      propertyId,
      checkIn: "2026-08-01",
      checkOut: "2026-08-05",
      guestCount: 2,
    });

    await holdRepository.save(hold);

    const loaded = await holdRepository.findById(holdId, tenantId);
    expect(loaded?.status).toBe("active");

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.checkIn).toBe("2026-08-01");
    expect(blocks[0]?.checkOut).toBe("2026-08-05");

    expect(await countOutboxForAggregate(holdId)).toBe(1);
  });

  it("releases hold and deactivates calendar block", async () => {
    const holdId = "550e8400-e29b-41d4-a716-446655442014";
    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId,
      propertyId,
      checkIn: "2026-09-01",
      checkOut: "2026-09-04",
      guestCount: 2,
    });

    await holdRepository.save(hold);
    hold.release();
    await holdRepository.save(hold);

    const blocks = await calendarRepository.findActiveBlocks(unitId, tenantId);
    expect(blocks).toHaveLength(0);
  });

  it("finds active hold by unit and period", async () => {
    const holdId = "550e8400-e29b-41d4-a716-446655442015";
    const hold = Hold.create({
      id: holdId,
      tenantId,
      unitId,
      propertyId,
      checkIn: "2026-10-10",
      checkOut: "2026-10-15",
      guestCount: 2,
    });

    await holdRepository.save(hold);

    const found = await holdRepository.findActiveByUnitAndPeriod(
      unitId,
      tenantId,
      "2026-10-12",
      "2026-10-14",
    );

    expect(found?.id).toBe(holdId);
  });
});

runIntegration("Hold concurrency integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const holdRepository = new PrismaHoldRepository(outboxRepository);

  const tenantId = "550e8400-e29b-41d4-a716-446655442020";
  const propertyId = "550e8400-e29b-41d4-a716-446655442021";
  const unitId = "550e8400-e29b-41d4-a716-446655442022";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("allows only one concurrent hold on overlapping dates", async () => {
    const attempts = 20;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () => {
        const hold = Hold.create({
          id: randomUUID(),
          tenantId,
          unitId,
          propertyId,
          checkIn: "2026-11-01",
          checkOut: "2026-11-05",
          guestCount: 2,
        });
        return holdRepository.save(hold);
      }),
    );

    const successes = results.filter((result) => result.status === "fulfilled");
    const conflicts = results.filter(
      (result) =>
        result.status === "rejected" && result.reason instanceof ConflictError,
    );

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(attempts - 1);
  });
});
