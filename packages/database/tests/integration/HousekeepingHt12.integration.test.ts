/**
 * HT-1/2 integration tests (TEST_DATABASE_URL).
 */
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Task, canonicalTurnoverSourceKey } from "@hcp/domain";
import {
  PrismaTaskRepository,
  PrismaUnitHousekeepingStatusRepository,
} from "../../src";
import {
  prisma,
  clearTenantContext,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const PROP_A = randomUUID();
const UNIT_A = randomUUID();
const USER_A = randomUUID();

runIntegration("HT-1/2 Housekeeping foundation", () => {
  const tasks = new PrismaTaskRepository();
  const hk = new PrismaUnitHousekeepingStatusRepository();

  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.user.create({
      data: {
        id: USER_A,
        email: `ht-int-${USER_A.slice(0, 8)}@demo.test`,
        name: "HT Int",
      },
    });
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, name: "HT A", slug: `ht-a-${TENANT_A.slice(0, 8)}` },
        { id: TENANT_B, name: "HT B", slug: `ht-b-${TENANT_B.slice(0, 8)}` },
      ],
      skipDuplicates: true,
    });
    await prisma.property.create({
      data: {
        id: PROP_A,
        tenantId: TENANT_A,
        name: "P",
        slug: `p-${PROP_A.slice(0, 8)}`,
        timezone: "Europe/Athens",
      },
    });
    await prisma.unit.create({
      data: {
        id: UNIT_A,
        tenantId: TENANT_A,
        propertyId: PROP_A,
        name: "U",
        slug: `u-${UNIT_A.slice(0, 8)}`,
        maxGuests: 2,
      },
    });
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    await prisma.task.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.unitHousekeepingStatus.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.unit.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.property.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.user.deleteMany({ where: { id: USER_A } });
    await prisma.$disconnect();
  });

  it("initializes CLEAN and isolates tenants", async () => {
    const status = await hk.ensureInitialized({
      tenantId: TENANT_A,
      propertyId: PROP_A,
      unitId: UNIT_A,
    });
    expect(status.status).toBe("CLEAN");

    const task = Task.create({
      id: randomUUID(),
      tenantId: TENANT_A,
      propertyId: PROP_A,
      unitId: UNIT_A,
      category: "GENERAL",
      title: "Note",
      createdByUserId: USER_A,
    });
    await tasks.save(task);

    await withTenantTransaction(TENANT_B, async (tx) => {
      const n = await tx.task.count({ where: { id: task.id } });
      expect(n).toBe(0);
    });
  });

  it("enforces unique turnover sourceKey", async () => {
    const key = canonicalTurnoverSourceKey(randomUUID());
    const a = Task.create({
      id: randomUUID(),
      tenantId: TENANT_A,
      propertyId: PROP_A,
      category: "HOUSEKEEPING",
      title: "T",
      source: "TURNOVER",
      sourceKey: key,
    });
    await tasks.save(a);
    const b = Task.create({
      id: randomUUID(),
      tenantId: TENANT_A,
      propertyId: PROP_A,
      category: "HOUSEKEEPING",
      title: "T",
      source: "TURNOVER",
      sourceKey: key,
    });
    await expect(tasks.save(b)).rejects.toBeTruthy();
  });
});
