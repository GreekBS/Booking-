-- CM-4c-4: Booking.com mapping + initial sync + reconciliation foundation.
-- Additive only. Do not apply to Production from this batch.

CREATE TABLE "channel_connection_provider_setups" (
  "tenant_id" UUID NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "setup_json" JSONB NOT NULL,
  "mapping_config_generation" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "channel_connection_provider_setups_pkey"
    PRIMARY KEY ("tenant_id", "connection_id"),
  CONSTRAINT "channel_connection_provider_setups_generation_check"
    CHECK ("mapping_config_generation" >= 0)
);

CREATE INDEX "channel_connection_provider_setups_tenant_provider_idx"
  ON "channel_connection_provider_setups" ("tenant_id", "provider");

ALTER TABLE "channel_connection_provider_setups" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_channel_connection_provider_setups"
  ON "channel_connection_provider_setups"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE TABLE "channel_product_mappings" (
  "tenant_id" UUID NOT NULL,
  "id" UUID NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "property_id" VARCHAR(255),
  "unit_id" VARCHAR(255),
  "rate_plan_id" VARCHAR(255),
  "external_hotel_id" VARCHAR(64),
  "external_room_type_id" VARCHAR(64),
  "external_rate_plan_id" VARCHAR(64),
  "external_room_rate_key" VARCHAR(255),
  "status" VARCHAR(32) NOT NULL,
  "mapping_version" INTEGER NOT NULL,
  "mapping_config_generation" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "channel_product_mappings_pkey"
    PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "channel_product_mappings_kind_check"
    CHECK ("kind" IN ('property_hotel', 'unit_room', 'rate_plan', 'room_rate')),
  CONSTRAINT "channel_product_mappings_status_check"
    CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "channel_product_mappings_version_check"
    CHECK ("mapping_version" >= 1),
  CONSTRAINT "channel_product_mappings_generation_check"
    CHECK ("mapping_config_generation" >= 0)
);

CREATE INDEX "channel_product_mappings_tenant_connection_idx"
  ON "channel_product_mappings" ("tenant_id", "connection_id");

CREATE UNIQUE INDEX "channel_product_mappings_active_hotel_uq"
  ON "channel_product_mappings" ("tenant_id", "connection_id", "external_hotel_id")
  WHERE "status" = 'active' AND "kind" = 'property_hotel' AND "external_hotel_id" IS NOT NULL;

CREATE UNIQUE INDEX "channel_product_mappings_active_room_uq"
  ON "channel_product_mappings" ("tenant_id", "connection_id", "external_room_type_id")
  WHERE "status" = 'active' AND "kind" = 'unit_room' AND "external_room_type_id" IS NOT NULL;

CREATE UNIQUE INDEX "channel_product_mappings_active_rate_uq"
  ON "channel_product_mappings" ("tenant_id", "connection_id", "external_rate_plan_id")
  WHERE "status" = 'active' AND "kind" = 'rate_plan' AND "external_rate_plan_id" IS NOT NULL;

CREATE UNIQUE INDEX "channel_product_mappings_active_roomrate_uq"
  ON "channel_product_mappings" (
    "tenant_id",
    "connection_id",
    "external_hotel_id",
    "external_room_type_id",
    "external_rate_plan_id"
  )
  WHERE "status" = 'active' AND "kind" = 'room_rate';

ALTER TABLE "channel_product_mappings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_channel_product_mappings"
  ON "channel_product_mappings"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE TABLE "channel_initial_sync_previews" (
  "tenant_id" UUID NOT NULL,
  "id" UUID NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "confirmation_token" CHAR(64) NOT NULL,
  "mapping_config_generation" INTEGER NOT NULL,
  "talos_state_fingerprint" CHAR(64) NOT NULL,
  "remote_snapshot_fingerprint" VARCHAR(128) NOT NULL,
  "summary_json" JSONB NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "confirmed_at" TIMESTAMPTZ,
  CONSTRAINT "channel_initial_sync_previews_pkey"
    PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "channel_initial_sync_previews_status_check"
    CHECK ("status" IN ('pending', 'confirmed', 'superseded', 'expired'))
);

CREATE INDEX "channel_initial_sync_previews_tenant_connection_idx"
  ON "channel_initial_sync_previews" ("tenant_id", "connection_id", "status");

CREATE UNIQUE INDEX "channel_initial_sync_previews_pending_token_uq"
  ON "channel_initial_sync_previews" ("tenant_id", "connection_id", "confirmation_token")
  WHERE "status" = 'pending';

ALTER TABLE "channel_initial_sync_previews" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_channel_initial_sync_previews"
  ON "channel_initial_sync_previews"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE TABLE "channel_reconciliation_runs" (
  "tenant_id" UUID NOT NULL,
  "id" UUID NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "scope" VARCHAR(32) NOT NULL,
  "outcome" VARCHAR(64) NOT NULL,
  "mapping_config_generation" INTEGER NOT NULL,
  "auto_heal_enqueued" BOOLEAN NOT NULL DEFAULT FALSE,
  "details_json" JSONB NOT NULL,
  "completed_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "channel_reconciliation_runs_pkey"
    PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "channel_reconciliation_runs_scope_check"
    CHECK ("scope" IN ('reservations', 'ari', 'mappings'))
);

CREATE INDEX "channel_reconciliation_runs_tenant_connection_idx"
  ON "channel_reconciliation_runs" ("tenant_id", "connection_id", "completed_at" DESC);

ALTER TABLE "channel_reconciliation_runs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_channel_reconciliation_runs"
  ON "channel_reconciliation_runs"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
