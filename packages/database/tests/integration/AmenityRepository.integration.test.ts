import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaAmenityRepository } from "../../src/repositories/AmenityRepository";
import { PrismaTenantRepository } from "../../src/repositories/TenantRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { Tenant, TenantSettings } from "@hcp/domain";
import { truncateIntegrationTables, prisma } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("AmenityRepository integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const tenantRepository = new PrismaTenantRepository(outboxRepository);
  const repository = new PrismaAmenityRepository();

  const tenantId = "550e8400-e29b-41d4-a716-446655440030";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await tenantRepository.save(
      Tenant.create({
        id: tenantId,
        name: "Amenity Tenant",
        slug: "int-amenity-tenant",
        settings: TenantSettings.create(),
      }),
    );
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("lists system and tenant amenities and saves custom amenity", async () => {
    const before = await repository.findAll(tenantId);

    const custom = await repository.saveCustom(tenantId, "Rooftop Terrace", "terrace", "outdoor");
    expect(custom.name).toBe("Rooftop Terrace");

    const after = await repository.findAll(tenantId);
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.some((a) => a.id === custom.id)).toBe(true);
  });
});
