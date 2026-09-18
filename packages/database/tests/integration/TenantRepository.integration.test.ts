import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Tenant, TenantSettings } from "@hcp/domain";
import { PrismaTenantRepository } from "../../src/repositories/TenantRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
} from "./helpers";
import { runIntegration } from "./integrationGate";

runIntegration("TenantRepository integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const repository = new PrismaTenantRepository(outboxRepository);

  beforeEach(async () => {
    await truncateIntegrationTables();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("creates, reads, updates and lists tenants", async () => {
    const tenant = Tenant.create({
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Integration Tenant",
      slug: "int-tenant-a",
      settings: TenantSettings.create({ timezone: "Europe/Athens" }),
    });

    await repository.save(tenant);

    const found = await repository.findById(tenant.id);
    expect(found?.name).toBe("Integration Tenant");
    expect(await repository.existsBySlug("int-tenant-a")).toBe(true);

    found!.updateName("Updated Tenant");
    await repository.save(found!);

    const updated = await repository.findById(tenant.id);
    expect(updated?.name).toBe("Updated Tenant");

    const page = await repository.findAll({ page: 1, limit: 10 });
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.data.some((t) => t.id === tenant.id)).toBe(true);
  });
});

runIntegration("TenantRepository outbox", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const repository = new PrismaTenantRepository(outboxRepository);

  beforeEach(async () => {
    await truncateIntegrationTables();
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("persists exactly one outbox event on tenant create", async () => {
    const tenantId = "550e8400-e29b-41d4-a716-446655440002";
    const tenant = Tenant.create({
      id: tenantId,
      name: "Outbox Tenant",
      slug: "int-outbox-tenant",
    });

    await repository.save(tenant);

    expect(await countOutboxForAggregate(tenantId)).toBe(1);

    const event = await prisma.outboxEvent.findFirst({ where: { aggregateId: tenantId } });
    expect(event?.eventType).toBe("TenantCreated");
  });
});
