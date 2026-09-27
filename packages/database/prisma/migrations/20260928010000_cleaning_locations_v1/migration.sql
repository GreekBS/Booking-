-- CleaningLocation V1: ops-only cleaning spaces, independent of commercial Units.
-- Additive + backward-compatible. Existing Unit QR / executions remain valid.
-- FORCE RLS + talos_runtime grants. Property ACL remains application-layer.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- cleaning_locations
-- ---------------------------------------------------------------------------
CREATE TABLE "cleaning_locations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'active',
  "sort_order" INT NOT NULL DEFAULT 0,
  "commercial_unit_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archived_at" TIMESTAMPTZ,
  CONSTRAINT "cleaning_locations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cleaning_locations_name_not_empty" CHECK (char_length(trim("name")) > 0),
  CONSTRAINT "cleaning_locations_status_check" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "cleaning_locations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_locations_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cleaning_locations_commercial_unit_id_fkey"
    FOREIGN KEY ("commercial_unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "cleaning_locations_tenant_property_idx"
  ON "cleaning_locations"("tenant_id", "property_id");
CREATE INDEX "cleaning_locations_tenant_property_status_idx"
  ON "cleaning_locations"("tenant_id", "property_id", "status");
CREATE UNIQUE INDEX "cleaning_locations_one_active_link_per_unit_uidx"
  ON "cleaning_locations"("tenant_id", "commercial_unit_id")
  WHERE "commercial_unit_id" IS NOT NULL AND "status" = 'active';
CREATE UNIQUE INDEX "cleaning_locations_active_name_per_property_uidx"
  ON "cleaning_locations"("tenant_id", "property_id", lower(trim("name")))
  WHERE "status" = 'active';

ALTER TABLE "cleaning_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_locations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_locations ON "cleaning_locations"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "cleaning_locations" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- cleaning_location_statuses
-- ---------------------------------------------------------------------------
CREATE TABLE "cleaning_location_statuses" (
  "cleaning_location_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'CLEAN',
  "source" VARCHAR(32) NOT NULL DEFAULT 'INIT',
  "updated_by_user_id" UUID,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INT NOT NULL DEFAULT 1,
  CONSTRAINT "cleaning_location_statuses_pkey" PRIMARY KEY ("cleaning_location_id"),
  CONSTRAINT "cleaning_location_statuses_status_check" CHECK ("status" IN ('CLEAN', 'DIRTY')),
  CONSTRAINT "cleaning_location_statuses_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "cleaning_location_statuses_location_fkey"
    FOREIGN KEY ("cleaning_location_id") REFERENCES "cleaning_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_location_statuses_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_location_statuses_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cleaning_location_statuses_updated_by_fkey"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "cleaning_location_statuses_tenant_property_status_idx"
  ON "cleaning_location_statuses"("tenant_id", "property_id", "status");

ALTER TABLE "cleaning_location_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_location_statuses" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_location_statuses ON "cleaning_location_statuses"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "cleaning_location_statuses" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- cleaning_location_qr_access
-- ---------------------------------------------------------------------------
CREATE TABLE "cleaning_location_qr_access" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "cleaning_location_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotated_at" TIMESTAMPTZ,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "cleaning_location_qr_access_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cleaning_location_qr_access_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT "cleaning_location_qr_access_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "cleaning_location_qr_access_property_id_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cleaning_location_qr_access_location_fkey"
    FOREIGN KEY ("cleaning_location_id") REFERENCES "cleaning_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "cleaning_location_qr_access_token_hash_uidx"
  ON "cleaning_location_qr_access"("token_hash");
CREATE UNIQUE INDEX "cleaning_location_qr_access_one_active_per_location_uidx"
  ON "cleaning_location_qr_access"("tenant_id", "cleaning_location_id")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "cleaning_location_qr_access_tenant_property_idx"
  ON "cleaning_location_qr_access"("tenant_id", "property_id");

ALTER TABLE "cleaning_location_qr_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cleaning_location_qr_access" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_location_qr_access ON "cleaning_location_qr_access"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "cleaning_location_qr_access" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- Point cleaning executions / photos / tasks at CleaningLocation (nullable)
-- Keep unit_id for legacy compatibility; allow NULL for hotel-only locations.
-- ---------------------------------------------------------------------------
ALTER TABLE "cleaning_executions"
  ADD COLUMN "cleaning_location_id" UUID;

ALTER TABLE "cleaning_executions"
  ALTER COLUMN "unit_id" DROP NOT NULL;

ALTER TABLE "cleaning_executions"
  ADD CONSTRAINT "cleaning_executions_cleaning_location_id_fkey"
    FOREIGN KEY ("cleaning_location_id") REFERENCES "cleaning_locations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cleaning_executions"
  ADD CONSTRAINT "cleaning_executions_unit_or_location_check"
    CHECK ("unit_id" IS NOT NULL OR "cleaning_location_id" IS NOT NULL);

CREATE INDEX "cleaning_executions_tenant_location_idx"
  ON "cleaning_executions"("tenant_id", "cleaning_location_id", "started_at" DESC);

ALTER TABLE "cleaning_photos"
  ADD COLUMN "cleaning_location_id" UUID;

ALTER TABLE "cleaning_photos"
  ALTER COLUMN "unit_id" DROP NOT NULL;

ALTER TABLE "cleaning_photos"
  ADD CONSTRAINT "cleaning_photos_cleaning_location_id_fkey"
    FOREIGN KEY ("cleaning_location_id") REFERENCES "cleaning_locations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cleaning_photos"
  ADD CONSTRAINT "cleaning_photos_unit_or_location_check"
    CHECK ("unit_id" IS NOT NULL OR "cleaning_location_id" IS NOT NULL);

CREATE INDEX "cleaning_photos_tenant_location_idx"
  ON "cleaning_photos"("tenant_id", "cleaning_location_id");

ALTER TABLE "tasks"
  ADD COLUMN "cleaning_location_id" UUID;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_cleaning_location_id_fkey"
    FOREIGN KEY ("cleaning_location_id") REFERENCES "cleaning_locations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tasks_tenant_cleaning_location_idx"
  ON "tasks"("tenant_id", "cleaning_location_id");

-- ---------------------------------------------------------------------------
-- Backfill: one CleaningLocation per Unit with HK / QR / cleaning footprint
-- Skip archived/deleted units and PILOT-ICAL-DO-NOT-USE properties.
-- ---------------------------------------------------------------------------
INSERT INTO "cleaning_locations" (
  "id", "tenant_id", "property_id", "name", "status", "sort_order",
  "commercial_unit_id", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  u."tenant_id",
  u."property_id",
  u."name",
  'active',
  0,
  u."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "units" u
INNER JOIN "properties" p ON p."id" = u."property_id"
WHERE u."deleted_at" IS NULL
  AND p."name" <> 'PILOT-ICAL-DO-NOT-USE'
  AND (
    EXISTS (
      SELECT 1 FROM "unit_housekeeping_statuses" hs WHERE hs."unit_id" = u."id"
    )
    OR EXISTS (
      SELECT 1 FROM "unit_qr_access" q WHERE q."unit_id" = u."id"
    )
    OR EXISTS (
      SELECT 1 FROM "cleaning_executions" e WHERE e."unit_id" = u."id"
    )
    OR EXISTS (
      SELECT 1 FROM "tasks" t
      WHERE t."unit_id" = u."id" AND t."category" = 'HOUSEKEEPING'
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "cleaning_locations" cl
    WHERE cl."commercial_unit_id" = u."id" AND cl."status" = 'active'
  );

INSERT INTO "cleaning_location_statuses" (
  "cleaning_location_id", "tenant_id", "property_id",
  "status", "source", "updated_by_user_id", "updated_at", "version"
)
SELECT
  cl."id",
  cl."tenant_id",
  cl."property_id",
  COALESCE(hs."status", 'CLEAN'),
  COALESCE(hs."source", 'INIT'),
  hs."updated_by_user_id",
  COALESCE(hs."updated_at", CURRENT_TIMESTAMP),
  COALESCE(hs."version", 1)
FROM "cleaning_locations" cl
LEFT JOIN "unit_housekeeping_statuses" hs ON hs."unit_id" = cl."commercial_unit_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "cleaning_location_statuses" s
  WHERE s."cleaning_location_id" = cl."id"
);

UPDATE "cleaning_executions" e
SET "cleaning_location_id" = cl."id"
FROM "cleaning_locations" cl
WHERE e."cleaning_location_id" IS NULL
  AND e."unit_id" IS NOT NULL
  AND cl."commercial_unit_id" = e."unit_id"
  AND cl."status" = 'active';

UPDATE "cleaning_photos" p
SET "cleaning_location_id" = cl."id"
FROM "cleaning_locations" cl
WHERE p."cleaning_location_id" IS NULL
  AND p."unit_id" IS NOT NULL
  AND cl."commercial_unit_id" = p."unit_id"
  AND cl."status" = 'active';

UPDATE "tasks" t
SET "cleaning_location_id" = cl."id"
FROM "cleaning_locations" cl
WHERE t."cleaning_location_id" IS NULL
  AND t."unit_id" IS NOT NULL
  AND t."category" = 'HOUSEKEEPING'
  AND cl."commercial_unit_id" = t."unit_id"
  AND cl."status" = 'active';

-- Mirror ACTIVE unit QR tokens onto location QR table (same hash → legacy + location resolve).
-- Do NOT revoke unit_qr_access rows.
INSERT INTO "cleaning_location_qr_access" (
  "id", "tenant_id", "property_id", "cleaning_location_id",
  "token_hash", "status", "created_at", "rotated_at", "revoked_at"
)
SELECT
  gen_random_uuid(),
  q."tenant_id",
  q."property_id",
  cl."id",
  q."token_hash",
  q."status",
  q."created_at",
  q."rotated_at",
  q."revoked_at"
FROM "unit_qr_access" q
INNER JOIN "cleaning_locations" cl
  ON cl."commercial_unit_id" = q."unit_id" AND cl."status" = 'active'
WHERE q."status" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM "cleaning_location_qr_access" lq
    WHERE lq."token_hash" = q."token_hash"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "cleaning_location_qr_access" lq2
    WHERE lq2."tenant_id" = q."tenant_id"
      AND lq2."cleaning_location_id" = cl."id"
      AND lq2."status" = 'ACTIVE'
  );
