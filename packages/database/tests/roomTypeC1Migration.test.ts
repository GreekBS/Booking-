import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20261010120000_room_type_foundation",
  "migration.sql",
);

describe("RoomType C1 migration contract", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates room_types additively and extends units with nullable hotel columns", () => {
    expect(sql).toContain('CREATE TABLE "room_types"');
    expect(sql).toContain('CREATE TYPE "RoomTypeStatus"');
    expect(sql).toContain('ADD COLUMN "room_type_id" UUID');
    expect(sql).toContain('ADD COLUMN "room_number" VARCHAR(64)');
    expect(sql).toContain('ADD COLUMN "floor" VARCHAR(32)');
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"units"\s+DROP/i);
    expect(sql).not.toMatch(/UPDATE\s+"units"/i);
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
  });

  it("binds RoomType to Property with composite tenant FK", () => {
    expect(sql).toContain('CONSTRAINT "room_types_tenant_id_property_id_fkey"');
    expect(sql).toContain('FOREIGN KEY ("tenant_id", "property_id")');
    expect(sql).toContain('REFERENCES "properties"("tenant_id", "id")');
    expect(sql).toContain("ON DELETE RESTRICT");
  });

  it("prevents cross-tenant/property Unit→RoomType attachment via composite FK", () => {
    expect(sql).toContain('CONSTRAINT "units_tenant_property_room_type_fkey"');
    expect(sql).toContain(
      'FOREIGN KEY ("tenant_id", "property_id", "room_type_id")',
    );
    expect(sql).toContain(
      'REFERENCES "room_types"("tenant_id", "property_id", "id")',
    );
    // Must not use ON DELETE SET NULL on the composite FK (would null tenant/property).
    expect(sql).toMatch(
      /units_tenant_property_room_type_fkey[\s\S]*?ON DELETE RESTRICT/,
    );
    expect(sql).not.toMatch(
      /units_tenant_property_room_type_fkey[\s\S]*?ON DELETE SET NULL/,
    );
  });

  it("enforces normalized uniqueness for RoomType code and Unit room number", () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "room_types_property_code_uidx"');
    expect(sql).toContain('lower(trim("code"))');
    expect(sql).toContain('WHERE "code" IS NOT NULL AND "deleted_at" IS NULL');
    expect(sql).toContain('CREATE UNIQUE INDEX "units_property_room_number_uidx"');
    expect(sql).toContain('lower(trim("room_number"))');
    expect(sql).toContain(
      'WHERE "room_number" IS NOT NULL AND "deleted_at" IS NULL',
    );
  });

  it("enables FORCE RLS with WITH CHECK and talos_runtime grants", () => {
    expect(sql).toContain('ALTER TABLE "room_types" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE "room_types" FORCE ROW LEVEL SECURITY');
    expect(sql).toContain(
      "CREATE POLICY tenant_isolation_room_types ON \"room_types\"",
    );
    expect(sql).toContain(
      "WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)",
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON "room_types" TO talos_runtime',
    );
  });

  it("does not touch booking, channel, Talia, or Website Builder objects", () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"bookings"/i);
    expect(sql).not.toMatch(/unit_calendar_blocks/i);
    expect(sql).not.toMatch(/channel_connections/i);
    expect(sql).not.toMatch(/channel_product_mappings/i);
    expect(sql).not.toMatch(/copilot_/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"websites"/i);
  });
});
