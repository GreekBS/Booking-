import { randomUUID } from "node:crypto";
import { Property, Tenant, TenantSettings } from "@hcp/domain";
import { PrismaPropertyRepository } from "../../src/repositories/PropertyRepository";
import { PrismaTenantRepository } from "../../src/repositories/TenantRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { prisma } from "./helpers";

export interface CommerceFixture {
  tenantId: string;
  propertyId: string;
  unitId: string;
}

export async function seedCommerceFixture(
  ids: CommerceFixture,
  options?: { adminUserId?: string },
): Promise<void> {
  const outbox = new PrismaOutboxRepository();
  const tenantRepository = new PrismaTenantRepository(outbox);
  const propertyRepository = new PrismaPropertyRepository(outbox);

  await tenantRepository.save(
    Tenant.create({
      id: ids.tenantId,
      name: "Commerce Tenant",
      slug: `int-commerce-${ids.tenantId.slice(-4)}`,
      settings: TenantSettings.create(),
    }),
  );

  const property = Property.create({
    id: ids.propertyId,
    tenantId: ids.tenantId,
    name: "Commerce Property",
    slug: `commerce-property-${ids.propertyId.slice(-4)}`,
    defaultUnit: { id: ids.unitId, maxGuests: 4 },
  });

  await propertyRepository.save(property);

  await prisma.property.update({
    where: { id: ids.propertyId },
    data: { status: "active" },
  });

  await prisma.unit.update({
    where: { id: ids.unitId },
    data: { status: "active" },
  });

  await prisma.ratePlan.create({
    data: {
      id: randomUUID(),
      tenantId: ids.tenantId,
      unitId: ids.unitId,
      baseNightlyAmount: "100.0000",
      currency: "EUR",
    },
  });

  await prisma.unitAvailabilityRule.create({
    data: {
      id: randomUUID(),
      tenantId: ids.tenantId,
      unitId: ids.unitId,
    },
  });

  if (options?.adminUserId) {
    await prisma.user.upsert({
      where: { id: options.adminUserId },
      create: {
        id: options.adminUserId,
        email: `admin-${options.adminUserId.slice(-8)}@commerce.test`,
        name: "Commerce Admin",
      },
      update: {},
    });

    await prisma.membership.upsert({
      where: {
        userId_tenantId: {
          userId: options.adminUserId,
          tenantId: ids.tenantId,
        },
      },
      create: {
        id: randomUUID(),
        userId: options.adminUserId,
        tenantId: ids.tenantId,
        role: "admin",
        status: "active",
      },
      update: {},
    });
  }

  await prisma.tenantCommerceSettings.upsert({
    where: { tenantId: ids.tenantId },
    create: {
      tenantId: ids.tenantId,
      defaultHoldTtlSeconds: 900,
      confirmationMode: "manual",
      defaultCurrency: "EUR",
    },
    update: {},
  });
}

export async function seedAdditionalUnit(
  tenantId: string,
  propertyId: string,
  unitId: string,
  options?: { name?: string; slug?: string },
): Promise<void> {
  await prisma.unit.create({
    data: {
      id: unitId,
      tenantId,
      propertyId,
      name: options?.name ?? "Commerce Unit 2",
      slug: options?.slug ?? `commerce-unit-${unitId.slice(-4)}`,
      maxGuests: 4,
      status: "active",
    },
  });

  await prisma.ratePlan.create({
    data: {
      id: randomUUID(),
      tenantId,
      unitId,
      baseNightlyAmount: "120.0000",
      currency: "EUR",
    },
  });

  await prisma.unitAvailabilityRule.create({
    data: {
      id: randomUUID(),
      tenantId,
      unitId,
    },
  });
}
