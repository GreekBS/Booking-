-- P1-S6a: inventory commit foundation
-- - channel_import CalendarBlockType (NOT added to hold/booking EXCLUDE)
-- - channel_inventory_reconciliations generation table
-- - outbox_events.delivery_key for idempotent S6 reconcile delivery
-- Does NOT create channel_imported_inventory_blocks (S6b).
-- Does NOT mutate UnitCalendarBlock rows.

ALTER TYPE "CalendarBlockType" ADD VALUE IF NOT EXISTS 'channel_import';

CREATE TYPE "ChannelInventoryReconcileStatus" AS ENUM (
  'pending',
  'applied',
  'superseded',
  'failed'
);

CREATE TABLE "channel_inventory_reconciliations" (
  "tenant_id" UUID NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "cursor_version" INTEGER NOT NULL,

  "semantic_config_version" INTEGER NOT NULL,
  "mapping_id" VARCHAR(255) NOT NULL,
  "mapping_version" INTEGER NOT NULL,
  "unit_id" VARCHAR(255) NOT NULL,
  "property_id" VARCHAR(255) NOT NULL,

  "snapshot_hash" CHAR(64) NOT NULL,
  "actionable_snapshot" JSONB NOT NULL,

  "reconcile_status" "ChannelInventoryReconcileStatus" NOT NULL,
  "reconcile_error_code" VARCHAR(80),

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "applied_at" TIMESTAMPTZ,

  CONSTRAINT "channel_inventory_reconciliations_pkey"
    PRIMARY KEY ("tenant_id", "connection_id", "cursor_version"),
  CONSTRAINT "channel_inventory_reconciliations_cursor_version_check"
    CHECK ("cursor_version" >= 1),
  CONSTRAINT "channel_inventory_reconciliations_semantic_config_version_check"
    CHECK ("semantic_config_version" >= 1),
  CONSTRAINT "channel_inventory_reconciliations_mapping_version_check"
    CHECK ("mapping_version" >= 1),
  CONSTRAINT "channel_inventory_reconciliations_snapshot_hash_check"
    CHECK ("snapshot_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "channel_inventory_reconciliations_connection_fkey"
    FOREIGN KEY ("tenant_id", "connection_id")
    REFERENCES "channel_connections"("tenant_id", "id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX "channel_inventory_reconciliations_status_cursor_idx"
  ON "channel_inventory_reconciliations" (
    "tenant_id",
    "connection_id",
    "reconcile_status",
    "cursor_version" DESC
  );

ALTER TABLE "channel_inventory_reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "channel_inventory_reconciliations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_channel_inventory_reconciliations"
  ON "channel_inventory_reconciliations"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

ALTER TABLE "outbox_events"
  ADD COLUMN IF NOT EXISTS "delivery_key" CHAR(64);

ALTER TABLE "outbox_events"
  DROP CONSTRAINT IF EXISTS "outbox_events_delivery_key_hex_check";

ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_delivery_key_hex_check"
  CHECK (
    "delivery_key" IS NULL
    OR "delivery_key" ~ '^[0-9a-f]{64}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS "outbox_events_tenant_event_delivery_key_uq"
  ON "outbox_events" ("tenant_id", "event_type", "delivery_key")
  WHERE "delivery_key" IS NOT NULL;
