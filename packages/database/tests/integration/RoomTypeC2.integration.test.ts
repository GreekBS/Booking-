/**
 * Phase C2 — RoomType repository persistence + authz-adjacent integrity.
 * Skips unless a safe integration DB is configured (see integrationGate).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ConflictError, RoomType } from "@hcp/domain";
import { PrismaRoomTypeRepository } from "../../src/repositories/RoomTypeRepository";
import {
  clearTenantContext,
  prisma,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT = randomUUID();
const PROP = randomUUID();
const UNIT = randomUUID();
const RT = randomUUID();
const SLUG = `int-rt-c2-${TENANT.slice(0, 8)}`;

const repo = new PrismaRoomTypeRepository();

runIntegration("RoomType C2 repository", () => {
  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.tenant.create({
      data: { id: TENANT, name: "RT C2 Tenant", slug: SLUG },
    });
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP,
          tenantId: TENANT,
          name: "C2 Hotel",
          slug: `c2-hotel-${PROP.slice(0, 6)}`,
          type: "hotel",
          status: "active",
        },
      });
      await tx.unit.create({
        data: {
          id: UNIT,
          tenantId: TENANT,
          propertyId: PROP,
          name: "Entire Property",
          slug: "entire-property",
          maxGuests: 2,
        },
      });
    });
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unit.deleteMany({ where: { tenantId: TENANT } });
      await tx.roomType.deleteMany({ where: { tenantId: TENANT } });
      await tx.property.deleteMany({ where: { tenantId: TENANT } });
    });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it("persists create/list/get and leaves Units unassigned", async () => {
    const roomType = RoomType.create({
      id: RT,
      tenantId: TENANT,
      propertyId: PROP,
      name: "Standard Double",
      code: "STD",
      maxGuests: 2,
      maxAdults: 2,
      maxChildren: 0,
    });
    await repo.save(roomType);

    const listed = await repo.listByProperty(TENANT, PROP);
    expect(listed.map((r) => r.id)).toContain(RT);

    const found = await repo.findById(TENANT, PROP, RT);
    expect(found?.code).toBe("STD");

    const unit = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.findUnique({ where: { id: UNIT } }),
    );
    expect(unit?.roomTypeId).toBeNull();
  });

  it("rejects duplicate codes via ConflictError", async () => {
    const dup = RoomType.create({
      id: randomUUID(),
      tenantId: TENANT,
      propertyId: PROP,
      name: "Standard Alt",
      code: "std",
      maxGuests: 2,
    });
    await expect(repo.save(dup)).rejects.toBeInstanceOf(ConflictError);
  });

  it("counts linked units and soft-deactivates safely", async () => {
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.unit.update({
        where: { id: UNIT },
        data: { roomTypeId: RT, roomNumber: "101" },
      });
    });

    expect(await repo.countLinkedUnits(TENANT, PROP, RT)).toBe(1);

    const existing = await repo.findById(TENANT, PROP, RT);
    expect(existing).not.toBeNull();
    existing!.deactivate();
    await repo.save(existing!);

    const after = await repo.findById(TENANT, PROP, RT);
    expect(after?.deletedAt).not.toBeNull();
    expect(after?.status).toBe("inactive");

    // Unit still linked — soft delete does not clear FK.
    const unit = await withTenantTransaction(TENANT, async (tx) =>
      tx.unit.findUnique({ where: { id: UNIT } }),
    );
    expect(unit?.roomTypeId).toBe(RT);
    expect(await repo.countLinkedUnits(TENANT, PROP, RT)).toBe(1);

    // Hard delete must be blocked by RESTRICT while units reference.
    await expect(
      withTenantTransaction(TENANT, async (tx) =>
        tx.roomType.delete({ where: { id: RT } }),
      ),
    ).rejects.toThrow();
  });

  it("hides soft-deleted RoomTypes from default list", async () => {
    const activeOnly = await repo.listByProperty(TENANT, PROP);
    expect(activeOnly.find((r) => r.id === RT)).toBeUndefined();

    const withDeleted = await repo.listByProperty(TENANT, PROP, {
      includeDeleted: true,
    });
    expect(withDeleted.find((r) => r.id === RT)).toBeTruthy();
  });
});
