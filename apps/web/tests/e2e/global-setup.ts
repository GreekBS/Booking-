import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { prisma } from "@hcp/database/client";
import { applyIntegrationTestDatabaseEnv } from "@hcp/database/safety";
import fs from "node:fs";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), "../../packages/database/.env") });
if (applyIntegrationTestDatabaseEnv() === "missing") {
  throw new Error(
    "E2E global setup requires TEST_DATABASE_URL (isolated non-production PostgreSQL). " +
      "DATABASE_URL is not used as a fallback. " +
      "REFUSING TO RUN DATABASE TEST/MUTATION AGAINST TALOS PRODUCTION DATABASE",
  );
}

export default async function globalSetup(): Promise<void> {
  const tenantAId = "550e8400-e29b-41d4-a716-446655441001";
  const tenantBId = "550e8400-e29b-41d4-a716-446655441002";
  const userAId = "550e8400-e29b-41d4-a716-446655441003";
  const propertyBId = "550e8400-e29b-41d4-a716-446655441004";
  const membershipAId = "550e8400-e29b-41d4-a716-446655441005";
  const unitBId = "550e8400-e29b-41d4-a716-446655441006";
  const password = "E2eTestPass123!";

  await prisma.tenant.upsert({
    where: { id: tenantAId },
    create: { id: tenantAId, name: "E2E Tenant A", slug: "e2e-tenant-a" },
    update: {},
  });
  await prisma.tenant.upsert({
    where: { id: tenantBId },
    create: { id: tenantBId, name: "E2E Tenant B", slug: "e2e-tenant-b" },
    update: {},
  });

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { id: userAId },
    create: {
      id: userAId,
      email: "e2e-admin-a@integration.test",
      name: "E2E Admin A",
      passwordHash,
      emailVerified: new Date(),
    },
    update: { passwordHash },
  });

  await prisma.membership.upsert({
    where: { id: membershipAId },
    create: {
      id: membershipAId,
      userId: userAId,
      tenantId: tenantAId,
      role: "admin",
      status: "active",
    },
    update: { status: "active" },
  });

  await prisma.property.upsert({
    where: { id: propertyBId },
    create: {
      id: propertyBId,
      tenantId: tenantBId,
      name: "Tenant B Property",
      slug: "tenant-b-property",
    },
    update: {},
  });

  await prisma.unit.upsert({
    where: { id: unitBId },
    create: {
      id: unitBId,
      tenantId: tenantBId,
      propertyId: propertyBId,
      name: "Unit B",
      slug: "unit-b",
      maxGuests: 4,
    },
    update: {},
  });

  const authDir = path.join(process.cwd(), "tests/e2e/.auth");
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(
    path.join(authDir, "context.json"),
    JSON.stringify({
      tenantAId,
      tenantBId,
      propertyBId,
      email: "e2e-admin-a@integration.test",
      password,
    }),
  );

  await prisma.$disconnect();
}
