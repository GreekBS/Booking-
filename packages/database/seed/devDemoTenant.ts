import { randomUUID } from "node:crypto";
import { Property } from "@hcp/domain";
import { PrismaPropertyRepository } from "../src/repositories/PropertyRepository.js";
import { PrismaOutboxRepository } from "../src/repositories/OutboxRepository.js";
import { prisma } from "../src/client.js";
import { hashPassword } from "./passwordHasher.js";

export const DEV_DEMO_TENANT_SLUG = "demo";
export const DEV_DEMO_TENANT_NAME = "Demo Tenant";

export const DEV_TENANT_OWNER_EMAIL = "owner@demo.local";
export const DEV_TENANT_OWNER_NAME = "Demo Owner";
export const DEV_TENANT_OWNER_PASSWORD = "Owner123!";

export const DEMO_TENANT_ID = "550e8400-e29b-41d4-a716-446655440010";
export const DEMO_PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440011";
export const DEMO_UNIT_ID = "550e8400-e29b-41d4-a716-446655440012";
export const DEMO_PROPERTY_NAME = "Demo Villa";
export const DEMO_PROPERTY_SLUG = "demo-villa";

export async function seedDevDemoTenant(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_DEMO_TENANT_SLUG },
    create: {
      id: DEMO_TENANT_ID,
      name: DEV_DEMO_TENANT_NAME,
      slug: DEV_DEMO_TENANT_SLUG,
      status: "active",
      timezone: "Europe/Athens",
      defaultLocale: "en",
      defaultCurrency: "EUR",
      settings: {},
    },
    update: {
      name: DEV_DEMO_TENANT_NAME,
      status: "active",
      deletedAt: null,
    },
  });

  const passwordHash = await hashPassword(DEV_TENANT_OWNER_PASSWORD);
  const owner = await prisma.user.upsert({
    where: { email: DEV_TENANT_OWNER_EMAIL },
    create: {
      email: DEV_TENANT_OWNER_EMAIL,
      name: DEV_TENANT_OWNER_NAME,
      passwordHash,
      emailVerified: new Date(),
    },
    update: {
      name: DEV_TENANT_OWNER_NAME,
      passwordHash,
      platformRole: null,
      emailVerified: new Date(),
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: owner.id,
        tenantId: tenant.id,
      },
    },
    create: {
      userId: owner.id,
      tenantId: tenant.id,
      role: "admin",
      status: "active",
      propertyIds: [],
    },
    update: {
      role: "admin",
      status: "active",
    },
  });

  const outbox = new PrismaOutboxRepository();
  const propertyRepository = new PrismaPropertyRepository(outbox);

  const existingProperty = await prisma.property.findUnique({
    where: { id: DEMO_PROPERTY_ID },
  });

  if (!existingProperty) {
    const property = Property.create({
      id: DEMO_PROPERTY_ID,
      tenantId: tenant.id,
      name: DEMO_PROPERTY_NAME,
      slug: DEMO_PROPERTY_SLUG,
      type: "villa",
      location: { city: "Paros", country: "GR" },
      defaultUnit: { id: DEMO_UNIT_ID, maxGuests: 6, bedrooms: 3, bathrooms: 2 },
    });
    await propertyRepository.save(property);
  }

  await prisma.property.update({
    where: { id: DEMO_PROPERTY_ID },
    data: { status: "active" },
  });

  await prisma.unit.update({
    where: { id: DEMO_UNIT_ID },
    data: { status: "active" },
  });

  await prisma.tenantCommerceSettings.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      defaultHoldTtlSeconds: 900,
      confirmationMode: "manual",
      defaultCurrency: "EUR",
    },
    update: {},
  });

  const ratePlan = await prisma.ratePlan.findFirst({
    where: { tenantId: tenant.id, unitId: DEMO_UNIT_ID },
  });
  if (!ratePlan) {
    await prisma.ratePlan.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        unitId: DEMO_UNIT_ID,
        baseNightlyAmount: "120.0000",
        currency: "EUR",
      },
    });
  }

  const availabilityRule = await prisma.unitAvailabilityRule.findFirst({
    where: { tenantId: tenant.id, unitId: DEMO_UNIT_ID },
  });
  if (!availabilityRule) {
    await prisma.unitAvailabilityRule.create({
      data: {
        id: randomUUID(),
        tenantId: tenant.id,
        unitId: DEMO_UNIT_ID,
      },
    });
  }

  console.log(`Tenant owner ready: ${DEV_TENANT_OWNER_EMAIL} (tenant admin on ${DEV_DEMO_TENANT_SLUG})`);
  console.log(`Demo property ready: ${DEMO_PROPERTY_NAME} (slug=${DEMO_PROPERTY_SLUG})`);
}
