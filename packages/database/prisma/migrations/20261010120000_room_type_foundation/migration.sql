-- Phase C1 — RoomType foundation
-- Additive only: room_types table + nullable Unit hotel metadata columns.
-- FORCE RLS + talos_runtime grants. Property ACL remains application-layer (C2+).
-- Does not alter bookings, channels, Talia, or Website Builder tables.
-- No backfill: existing Units keep room_type_id / room_number / floor NULL.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Composite FK target already present from Website Builder A1; keep idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS "properties_tenant_id_id_uidx"
  ON "properties"("tenant_id", "id");

-- ---------------------------------------------------------------------------
-- RoomTypeStatus enum
-- ---------------------------------------------------------------------------
CREATE TYPE "RoomTypeStatus" AS ENUM ('active', 'inactive');

-- ---------------------------------------------------------------------------
-- room_types
-- ---------------------------------------------------------------------------
CREATE TABLE "room_types" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "code" VARCHAR(64),
  "description" TEXT,
  "max_guests" INT NOT NULL,
  "max_adults" INT,
  "max_children" INT,
  "status" "RoomTypeStatus" NOT NULL DEFAULT 'active',
  "sort_order" INT NOT NULL DEFAULT 0,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Prisma @updatedAt — no DB default (application sets on write).
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "room_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "room_types_name_not_empty"
    CHECK (char_length(trim("name")) > 0),
  CONSTRAINT "room_types_code_not_blank"
    CHECK ("code" IS NULL OR char_length(trim("code")) > 0),
  CONSTRAINT "room_types_max_guests_positive"
    CHECK ("max_guests" >= 1 AND "max_guests" <= 100),
  CONSTRAINT "room_types_max_adults_nonneg"
    CHECK ("max_adults" IS NULL OR ("max_adults" >= 0 AND "max_adults" <= 100)),
  CONSTRAINT "room_types_max_children_nonneg"
    CHECK ("max_children" IS NULL OR ("max_children" >= 0 AND "max_children" <= 100)),
  CONSTRAINT "room_types_sort_order_nonneg"
    CHECK ("sort_order" >= 0),
  CONSTRAINT "room_types_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  -- Prevents cross-tenant property attachment (tenant_id must match property.tenant_id).
  CONSTRAINT "room_types_tenant_id_property_id_fkey"
    FOREIGN KEY ("tenant_id", "property_id")
    REFERENCES "properties"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "room_types_tenant_property_id_uidx"
  ON "room_types"("tenant_id", "property_id", "id");
CREATE UNIQUE INDEX "room_types_tenant_id_id_uidx"
  ON "room_types"("tenant_id", "id");
CREATE INDEX "room_types_tenant_property_status_idx"
  ON "room_types"("tenant_id", "property_id", "status");
CREATE INDEX "room_types_tenant_property_sort_idx"
  ON "room_types"("tenant_id", "property_id", "sort_order");
-- Code unique within property when present and RoomType not soft-deleted.
CREATE UNIQUE INDEX "room_types_property_code_uidx"
  ON "room_types"("property_id", lower(trim("code")))
  WHERE "code" IS NOT NULL AND "deleted_at" IS NULL;

ALTER TABLE "room_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "room_types" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_room_types ON "room_types"
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "room_types" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- units — optional hotel metadata (nullable; no backfill)
-- ---------------------------------------------------------------------------
ALTER TABLE "units"
  ADD COLUMN "room_type_id" UUID,
  ADD COLUMN "room_number" VARCHAR(64),
  ADD COLUMN "floor" VARCHAR(32);

ALTER TABLE "units"
  ADD CONSTRAINT "units_room_number_not_blank"
    CHECK ("room_number" IS NULL OR char_length(trim("room_number")) > 0),
  ADD CONSTRAINT "units_floor_not_blank"
    CHECK ("floor" IS NULL OR char_length(trim("floor")) > 0);

-- Composite FK: Unit may only reference a RoomType in the same tenant + property.
-- ON DELETE RESTRICT (not SET NULL) — composite SET NULL would null tenant_id/property_id.
ALTER TABLE "units"
  ADD CONSTRAINT "units_tenant_property_room_type_fkey"
    FOREIGN KEY ("tenant_id", "property_id", "room_type_id")
    REFERENCES "room_types"("tenant_id", "property_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "units_tenant_property_room_type_idx"
  ON "units"("tenant_id", "property_id", "room_type_id");

-- Room numbers unique within a property when set and unit not soft-deleted.
CREATE UNIQUE INDEX "units_property_room_number_uidx"
  ON "units"("property_id", lower(trim("room_number")))
  WHERE "room_number" IS NOT NULL AND "deleted_at" IS NULL;
