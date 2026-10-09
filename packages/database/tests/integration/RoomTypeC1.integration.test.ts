/**
 * Phase C1 — RoomType schema / RLS / composite FK / uniqueness.
 * Skips unless a safe integration DB is configured (see integrationGate).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  clearTenantContext,
  prisma,
  verifyRoomTypeRlsPoliciesActive,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const PROP_A = randomUUID();
const PROP_B = randomUUID();
const UNIT_A = randomUUID();
const UNIT_B = randomUUID();
const ROOM_TYPE_A = randomUUID();
const ROOM_TYPE_A2 = randomUUID();
const SLUG_A = `int-rt-a-${TENANT_A.slice(0, 8)}`;
const SLUG_B = `int-rt-b-${TENANT_B.slice(0, 8)}`;

runIntegration("RoomType C1 foundation", () => {
  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, name: "RT C1 Tenant A", slug: SLUG_A },
        { id: TENANT_B, name: "RT C1 Tenant B", slug: SLUG_B },
      ],
    });
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP_A,
          tenantId: TENANT_A,
          name: "Hotel A",
          slug: `hotel-a-${PROP_A.slice(0, 6)}`,
          type: "hotel",
          status: "active",
        },
      });
      await tx.unit.create({
        data: {
          id: UNIT_A,
          tenantId: TENANT_A,
          propertyId: PROP_A,
          name: "Entire Property",
          slug: "entire-property",
          maxGuests: 2,
        },
      });
    });
    await withTenantTransaction(TENANT_B, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP_B,
          tenantId: TENANT_B,
          name: "Hotel B",
          slug: `hotel-b-${PROP_B.slice(0, 6)}`,
          type: "hotel",
          status: "active",
        },
      });
      await tx.unit.create({
        data: {
          id: UNIT_B,
          tenantId: TENANT_B,
          propertyId: PROP_B,
          name: "Entire Property",
          slug: "entire-property",
          maxGuests: 2,
        },
      });
    });
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    for (const tenantId of [TENANT_A, TENANT_B]) {
      await withTenantTransaction(tenantId, async (tx) => {
        await tx.unit.deleteMany({ where: { tenantId } });
        await tx.roomType.deleteMany({ where: { tenantId } });
        await tx.property.deleteMany({ where: { tenantId } });
      });
    }
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.$disconnect();
  });

  it("has FORCE RLS enabled on room_types", async () => {
    expect(await verifyRoomTypeRlsPoliciesActive()).toBe(true);
    const forced = await prisma.$queryRaw<
      Array<{ relname: string; relforcerowsecurity: boolean }>
    >`
      SELECT c.relname, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'room_types'
    `;
    expect(forced).toHaveLength(1);
    expect(forced[0]!.relforcerowsecurity).toBe(true);
  });

  it("installs tenant isolation policy with USING + WITH CHECK and runtime grants", async () => {
    const policies = await prisma.$queryRaw<
      Array<{
        tablename: string;
        policyname: string;
        qual: string | null;
        with_check: string | null;
      }>
    >`
      SELECT tablename, policyname, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'room_types'
    `;
    expect(policies).toHaveLength(1);
    expect(policies[0]!.qual).toContain("app.current_tenant");
    expect(policies[0]!.with_check).toContain("app.current_tenant");

    const grants = await prisma.$queryRaw<Array<{ has_grant: boolean }>>`
      SELECT has_table_privilege('talos_runtime', 'public.room_types', 'SELECT,INSERT,UPDATE,DELETE') AS has_grant
    `;
    expect(grants[0]?.has_grant).toBe(true);
  });

  it("creates a RoomType and leaves existing Units unassigned", async () => {
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.roomType.create({
        data: {
          id: ROOM_TYPE_A,
          tenantId: TENANT_A,
          propertyId: PROP_A,
          name: "Standard Double",
          code: "STD",
          maxGuests: 2,
          updatedAt: new Date(),
        },
      });
    });

    const unit = await withTenantTransaction(TENANT_A, async (tx) =>
      tx.unit.findUnique({ where: { id: UNIT_A } }),
    );
    expect(unit?.roomTypeId).toBeNull();
    expect(unit?.roomNumber).toBeNull();
    expect(unit?.floor).toBeNull();
    expect(unit?.id).toBe(UNIT_A);
  });

  it("rejects cross-tenant property attachment via composite FK", async () => {
    await expect(
      withTenantTransaction(TENANT_A, async (tx) =>
        tx.roomType.create({
          data: {
            id: randomUUID(),
            tenantId: TENANT_A,
            propertyId: PROP_B,
            name: "Illegal",
            maxGuests: 2,
            updatedAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects attaching a Unit to a RoomType from another property", async () => {
    const foreignType = randomUUID();
    await withTenantTransaction(TENANT_B, async (tx) => {
      await tx.roomType.create({
        data: {
          id: foreignType,
          tenantId: TENANT_B,
          propertyId: PROP_B,
          name: "Foreign Type",
          code: "FOR",
          maxGuests: 2,
          updatedAt: new Date(),
        },
      });
    });

    await expect(
      withTenantTransaction(TENANT_A, async (tx) =>
        tx.unit.update({
          where: { id: UNIT_A },
          data: { roomTypeId: foreignType },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects duplicate RoomType codes within a property (case/trim normalized)", async () => {
    await expect(
      withTenantTransaction(TENANT_A, async (tx) =>
        tx.roomType.create({
          data: {
            id: ROOM_TYPE_A2,
            tenantId: TENANT_A,
            propertyId: PROP_A,
            name: "Standard Double Alt",
            code: " std ",
            maxGuests: 2,
            updatedAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("allows nullable RoomType assignment and rejects duplicate room numbers", async () => {
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.unit.update({
        where: { id: UNIT_A },
        data: {
          roomTypeId: ROOM_TYPE_A,
          roomNumber: "204",
          floor: "2",
        },
      });
    });

    const assigned = await withTenantTransaction(TENANT_A, async (tx) =>
      tx.unit.findUnique({ where: { id: UNIT_A } }),
    );
    expect(assigned?.roomTypeId).toBe(ROOM_TYPE_A);
    expect(assigned?.roomNumber).toBe("204");

    const sibling = randomUUID();
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.unit.create({
        data: {
          id: sibling,
          tenantId: TENANT_A,
          propertyId: PROP_A,
          name: "Room 205",
          slug: "room-205",
          maxGuests: 2,
          roomTypeId: ROOM_TYPE_A,
          roomNumber: "205",
        },
      });
    });

    await expect(
      withTenantTransaction(TENANT_A, async (tx) =>
        tx.unit.create({
          data: {
            id: randomUUID(),
            tenantId: TENANT_A,
            propertyId: PROP_A,
            name: "Room 204 Dup",
            slug: "room-204-dup",
            maxGuests: 2,
            roomNumber: " 204 ",
          },
        }),
      ),
    ).rejects.toThrow();

    // Cleanup sibling for later assertions
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.unit.delete({ where: { id: sibling } });
    });
  });

  it("preserves unit_calendar_no_overlap EXCLUDE constraint", async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'unit_calendar_blocks'
        AND c.conname = 'unit_calendar_no_overlap'
    `;
    expect(rows).toHaveLength(1);
  });

  it("keeps channel_product_mappings external_room_type_id contract unchanged", async () => {
    const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'channel_product_mappings'
        AND column_name = 'external_room_type_id'
    `;
    expect(cols).toHaveLength(1);

    const fk = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'channel_product_mappings'
        AND c.contype = 'f'
        AND pg_get_constraintdef(c.oid) ILIKE '%room_types%'
    `;
    expect(fk).toHaveLength(0);
  });

  it("allows talos_runtime to insert RoomTypes under tenant GUC", async () => {
    const id = randomUUID();
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE talos_runtime");
      await tx.$executeRaw`
        INSERT INTO room_types (
          id, tenant_id, property_id, name, code, max_guests, status, sort_order, updated_at
        ) VALUES (
          ${id}::uuid,
          ${TENANT_A}::uuid,
          ${PROP_A}::uuid,
          'Junior Suite',
          'JSU',
          3,
          'active',
          1,
          NOW()
        )
      `;
    });

    const row = await withTenantTransaction(TENANT_A, async (tx) =>
      tx.roomType.findUnique({ where: { id } }),
    );
    expect(row?.name).toBe("Junior Suite");
    expect(row?.code).toBe("JSU");
  });
});
