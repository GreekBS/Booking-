import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Property } from "@hcp/domain";
import { PrismaPropertyRepository } from "../../src/repositories/PropertyRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaTenantRepository } from "../../src/repositories/TenantRepository";
import { Tenant, TenantSettings } from "@hcp/domain";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
  setTenantContext,
  clearTenantContext,
} from "./helpers";
import { runIntegration } from "./integrationGate";


runIntegration("PropertyRepository integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const tenantRepository = new PrismaTenantRepository(outboxRepository);
  const repository = new PrismaPropertyRepository(outboxRepository);

  const tenantId = "550e8400-e29b-41d4-a716-446655440010";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await tenantRepository.save(
      Tenant.create({
        id: tenantId,
        name: "Property Tenant",
        slug: "int-property-tenant",
        settings: TenantSettings.create(),
      }),
    );
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("creates, reads, updates and archives properties", async () => {
    const propertyId = "550e8400-e29b-41d4-a716-446655440011";
    const unitId = "550e8400-e29b-41d4-a716-446655440012";

    const property = Property.create({
      id: propertyId,
      tenantId,
      name: "Villa Test",
      slug: "villa-test",
      defaultUnit: { id: unitId, maxGuests: 6 },
    });

    await repository.save(property);

    const found = await repository.findById(tenantId, propertyId);
    expect(found?.name).toBe("Villa Test");
    expect(found?.units.length).toBe(1);

    found!.update({ name: "Villa Updated" });
    await repository.save(found!);

    const updated = await repository.findById(tenantId, propertyId);
    expect(updated?.name).toBe("Villa Updated");

    updated!.archive();
    await repository.save(updated!);

    const archived = await repository.findById(tenantId, propertyId);
    expect(archived).toBeNull();
  });

  it("persists exactly one outbox event on property create", async () => {
    const propertyId = "550e8400-e29b-41d4-a716-446655440013";
    const property = Property.create({
      id: propertyId,
      tenantId,
      name: "Outbox Property",
      slug: "outbox-property",
      defaultUnit: {
        id: "550e8400-e29b-41d4-a716-446655440014",
        maxGuests: 4,
      },
    });

    await repository.save(property);

    expect(await countOutboxForAggregate(propertyId)).toBe(1);
    const event = await prisma.outboxEvent.findFirst({ where: { aggregateId: propertyId } });
    expect(event?.eventType).toBe("PropertyCreated");
  });

  it("persists exactly one outbox event on property archive", async () => {
    const propertyId = "550e8400-e29b-41d4-a716-446655440015";
    const property = Property.create({
      id: propertyId,
      tenantId,
      name: "Archive Property",
      slug: "archive-property",
      defaultUnit: {
        id: "550e8400-e29b-41d4-a716-446655440016",
        maxGuests: 4,
      },
    });

    await repository.save(property);
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: propertyId } });

    const loaded = await repository.findById(tenantId, propertyId);
    loaded!.archive();
    await repository.save(loaded!);

    expect(await countOutboxForAggregate(propertyId)).toBe(1);
    const event = await prisma.outboxEvent.findFirst({
      where: { aggregateId: propertyId },
      orderBy: { createdAt: "desc" },
    });
    expect(event?.eventType).toBe("PropertyArchived");
  });

  it("respects RLS tenant context on property reads", async () => {
    const role = await prisma.$queryRaw<
      Array<{ rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    const current = role[0];
    if (current?.rolsuper || current?.rolbypassrls) {
      // Supabase admin connections bypass RLS; policies verified in rls.integration.test.ts.
      return;
    }

    const otherTenantId = "550e8400-e29b-41d4-a716-446655440017";
    await tenantRepository.save(
      Tenant.create({
        id: otherTenantId,
        name: "Other Tenant",
        slug: "int-other-tenant",
      }),
    );

    const propertyId = "550e8400-e29b-41d4-a716-446655440018";
    await repository.save(
      Property.create({
        id: propertyId,
        tenantId: otherTenantId,
        name: "RLS Property",
        slug: "rls-property",
        defaultUnit: {
          id: "550e8400-e29b-41d4-a716-446655440019",
          maxGuests: 2,
        },
      }),
    );

    await setTenantContext(prisma, tenantId);
    const visible = await prisma.property.findMany();
    await clearTenantContext(prisma);

    expect(visible.every((p) => p.tenantId === tenantId)).toBe(true);
    expect(visible.some((p) => p.id === propertyId)).toBe(false);
  });
});
