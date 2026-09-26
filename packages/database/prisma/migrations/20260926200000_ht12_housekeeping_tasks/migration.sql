-- HT-1/HT-2: Tasks + Unit housekeeping status (additive).
-- Inventory/calendar blocks are NOT used as housekeeping state.
-- Tenant RLS FORCE; Property ACL remains application-layer.

CREATE TABLE "tasks" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "unit_id" UUID,
  "booking_id" UUID,
  "guest_id" UUID,
  "category" VARCHAR(32) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "status" VARCHAR(32) NOT NULL,
  "priority" VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
  "assigned_to_user_id" UUID,
  "due_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "completion_note" TEXT,
  "source" VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
  "source_key" VARCHAR(128),
  "version" INT NOT NULL DEFAULT 1,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tasks_category_check" CHECK (
    "category" IN ('HOUSEKEEPING', 'MAINTENANCE', 'INSPECTION', 'GUEST_REQUEST', 'GENERAL')
  ),
  CONSTRAINT "tasks_status_check" CHECK (
    "status" IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  ),
  CONSTRAINT "tasks_priority_check" CHECK (
    "priority" IN ('NORMAL', 'HIGH', 'URGENT')
  ),
  CONSTRAINT "tasks_source_check" CHECK (
    "source" IN ('MANUAL', 'TURNOVER', 'SYSTEM')
  ),
  CONSTRAINT "tasks_title_not_empty" CHECK (char_length(trim("title")) > 0),
  CONSTRAINT "tasks_version_positive" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX "tasks_tenant_id_source_key_uidx"
  ON "tasks"("tenant_id", "source_key")
  WHERE "source_key" IS NOT NULL;

CREATE INDEX "tasks_tenant_id_property_id_status_idx"
  ON "tasks"("tenant_id", "property_id", "status");
CREATE INDEX "tasks_tenant_id_due_at_idx"
  ON "tasks"("tenant_id", "due_at");
CREATE INDEX "tasks_tenant_id_assigned_to_user_id_idx"
  ON "tasks"("tenant_id", "assigned_to_user_id");
CREATE INDEX "tasks_tenant_id_booking_id_idx"
  ON "tasks"("tenant_id", "booking_id");
CREATE INDEX "tasks_tenant_id_unit_id_idx"
  ON "tasks"("tenant_id", "unit_id");
CREATE INDEX "tasks_tenant_id_category_status_idx"
  ON "tasks"("tenant_id", "category", "status");

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_guest_id_fkey"
  FOREIGN KEY ("guest_id") REFERENCES "guests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_assigned_to_user_id_fkey"
  FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_tasks ON tasks
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "tasks" TO talos_runtime;

CREATE TABLE "unit_housekeeping_statuses" (
  "unit_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'CLEAN',
  "source" VARCHAR(32) NOT NULL DEFAULT 'INIT',
  "updated_by_user_id" UUID,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "version" INT NOT NULL DEFAULT 1,
  CONSTRAINT "unit_housekeeping_statuses_pkey" PRIMARY KEY ("unit_id"),
  CONSTRAINT "unit_housekeeping_statuses_status_check" CHECK (
    "status" IN ('CLEAN', 'DIRTY')
  ),
  CONSTRAINT "unit_housekeeping_statuses_source_check" CHECK (
    "source" IN ('INIT', 'TURNOVER', 'TASK_COMPLETE', 'TASK_REOPEN', 'MANUAL', 'SYSTEM')
  ),
  CONSTRAINT "unit_housekeeping_statuses_version_positive" CHECK ("version" >= 1)
);

CREATE INDEX "unit_housekeeping_statuses_tenant_id_property_id_status_idx"
  ON "unit_housekeeping_statuses"("tenant_id", "property_id", "status");

ALTER TABLE "unit_housekeeping_statuses"
  ADD CONSTRAINT "unit_housekeeping_statuses_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unit_housekeeping_statuses"
  ADD CONSTRAINT "unit_housekeeping_statuses_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unit_housekeeping_statuses"
  ADD CONSTRAINT "unit_housekeeping_statuses_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "unit_housekeeping_statuses"
  ADD CONSTRAINT "unit_housekeeping_statuses_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "unit_housekeeping_statuses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unit_housekeeping_statuses" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_unit_housekeeping_statuses ON unit_housekeeping_statuses
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "unit_housekeeping_statuses" TO talos_runtime;

-- Initialize existing units as CLEAN (demo baseline, not historical truth).
INSERT INTO "unit_housekeeping_statuses" (
  "unit_id",
  "tenant_id",
  "property_id",
  "status",
  "source",
  "updated_by_user_id",
  "updated_at",
  "version"
)
SELECT
  u."id",
  u."tenant_id",
  u."property_id",
  'CLEAN',
  'INIT',
  NULL,
  CURRENT_TIMESTAMP,
  1
FROM "units" u
WHERE u."deleted_at" IS NULL
ON CONFLICT ("unit_id") DO NOTHING;
