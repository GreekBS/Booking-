-- Messaging WhatsApp V1 — Central Talos WhatsApp + Booking-driven messaging.
-- Additive. Does not touch Units / RatePlans / Channel Manager / fiscal.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Platform connection (no tenant_id — single Talos WhatsApp number)
-- ---------------------------------------------------------------------------
CREATE TABLE "platform_messaging_connections" (
  "id" UUID NOT NULL,
  "channel" VARCHAR(32) NOT NULL DEFAULT 'whatsapp',
  "provider" VARCHAR(32) NOT NULL DEFAULT 'meta_cloud',
  "external_account_id" VARCHAR(128),
  "phone_number_id" VARCHAR(64) NOT NULL,
  "display_phone_number" VARCHAR(32),
  "credential_ref" VARCHAR(255),
  "webhook_verification_ref" VARCHAR(255),
  "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
  "config_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_messaging_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_messaging_connections_channel_check"
    CHECK ("channel" IN ('whatsapp')),
  CONSTRAINT "platform_messaging_connections_status_check"
    CHECK ("status" IN ('draft', 'connected', 'disconnected', 'error'))
);

CREATE UNIQUE INDEX "platform_messaging_connections_phone_number_id_uidx"
  ON "platform_messaging_connections"("phone_number_id");
CREATE UNIQUE INDEX "platform_messaging_connections_one_active_whatsapp_uidx"
  ON "platform_messaging_connections"("channel")
  WHERE "status" = 'connected';

GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_messaging_connections" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- Messaging secrets (platform or tenant-owned sealed material)
-- ---------------------------------------------------------------------------
CREATE TABLE "messaging_secret_records" (
  "id" UUID NOT NULL,
  "owner_kind" VARCHAR(16) NOT NULL,
  "tenant_id" UUID,
  "kind" VARCHAR(32) NOT NULL,
  "ciphertext" BYTEA NOT NULL,
  "key_version" INT NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "messaging_secret_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messaging_secret_records_owner_kind_check"
    CHECK ("owner_kind" IN ('platform', 'tenant')),
  CONSTRAINT "messaging_secret_records_kind_check"
    CHECK ("kind" IN ('credential', 'webhook_verification')),
  CONSTRAINT "messaging_secret_records_owner_tenancy_check"
    CHECK (
      ("owner_kind" = 'platform' AND "tenant_id" IS NULL)
      OR ("owner_kind" = 'tenant' AND "tenant_id" IS NOT NULL)
    ),
  CONSTRAINT "messaging_secret_records_key_version_check"
    CHECK ("key_version" >= 1),
  CONSTRAINT "messaging_secret_records_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "messaging_secret_records_tenant_kind_idx"
  ON "messaging_secret_records"("tenant_id", "kind")
  WHERE "tenant_id" IS NOT NULL AND "deleted_at" IS NULL;
CREATE INDEX "messaging_secret_records_platform_kind_idx"
  ON "messaging_secret_records"("owner_kind", "kind")
  WHERE "owner_kind" = 'platform' AND "deleted_at" IS NULL;

ALTER TABLE "messaging_secret_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messaging_secret_records" FORCE ROW LEVEL SECURITY;
-- Platform rows: accessible only when no tenant GUC is set (service paths).
-- Tenant rows: standard tenant isolation.
CREATE POLICY tenant_isolation_messaging_secret_records ON "messaging_secret_records"
  USING (
    CASE
      WHEN owner_kind = 'platform' THEN
        NULLIF(current_setting('app.current_tenant', true), '') IS NULL
      ELSE
        tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    END
  )
  WITH CHECK (
    CASE
      WHEN owner_kind = 'platform' THEN
        NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        AND tenant_id IS NULL
      ELSE
        tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    END
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "messaging_secret_records" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- Property messaging settings / automations
-- ---------------------------------------------------------------------------
CREATE TABLE "property_messaging_settings" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
  "welcome_enabled" BOOLEAN NOT NULL DEFAULT false,
  "welcome_template_name" VARCHAR(128),
  "welcome_template_language" VARCHAR(16) NOT NULL DEFAULT 'en',
  "arrival_enabled" BOOLEAN NOT NULL DEFAULT false,
  "arrival_template_name" VARCHAR(128),
  "arrival_template_language" VARCHAR(16) NOT NULL DEFAULT 'en',
  "arrival_timing_mode" VARCHAR(32) NOT NULL DEFAULT 'check_in_local_time',
  "arrival_local_time" VARCHAR(8) NOT NULL DEFAULT '09:00',
  "arrival_offset_days" INT NOT NULL DEFAULT 0,
  "arrival_offset_hours" INT NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_messaging_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_messaging_settings_timing_check"
    CHECK ("arrival_timing_mode" IN (
      'check_in_local_time',
      'days_before_check_in',
      'hours_before_check_in'
    )),
  CONSTRAINT "property_messaging_settings_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "property_messaging_settings_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "property_messaging_settings_property_uidx"
  ON "property_messaging_settings"("property_id");
CREATE INDEX "property_messaging_settings_tenant_idx"
  ON "property_messaging_settings"("tenant_id");

ALTER TABLE "property_messaging_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "property_messaging_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_property_messaging_settings ON "property_messaging_settings"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "property_messaging_settings" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- Booking messaging profile (stay-scoped WhatsApp contact + binding)
-- ---------------------------------------------------------------------------
CREATE TABLE "booking_messaging_profiles" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "guest_id" UUID,
  "conversation_id" UUID,
  "whatsapp_phone" VARCHAR(32),
  "whatsapp_phone_normalized" VARCHAR(32),
  "guest_channel_identity" VARCHAR(64),
  "contact_source" VARCHAR(32) NOT NULL DEFAULT 'manual',
  "contact_confirmed_at" TIMESTAMPTZ,
  "messaging_enabled" BOOLEAN NOT NULL DEFAULT false,
  "identity_status" VARCHAR(32) NOT NULL DEFAULT 'unbound',
  "csw_open_until" TIMESTAMPTZ,
  "last_guest_inbound_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_messaging_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "booking_messaging_profiles_contact_source_check"
    CHECK ("contact_source" IN ('manual', 'snapshot_prefill', 'crm_prefill')),
  CONSTRAINT "booking_messaging_profiles_identity_status_check"
    CHECK ("identity_status" IN (
      'unbound', 'bound', 'ambiguous', 'orphaned_inbound'
    )),
  CONSTRAINT "booking_messaging_profiles_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "booking_messaging_profiles_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "booking_messaging_profiles_booking_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "booking_messaging_profiles_guest_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "booking_messaging_profiles_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "booking_messaging_profiles_booking_uidx"
  ON "booking_messaging_profiles"("booking_id");
CREATE INDEX "booking_messaging_profiles_tenant_identity_idx"
  ON "booking_messaging_profiles"("tenant_id", "guest_channel_identity")
  WHERE "guest_channel_identity" IS NOT NULL;
CREATE INDEX "booking_messaging_profiles_identity_enabled_idx"
  ON "booking_messaging_profiles"("guest_channel_identity", "messaging_enabled")
  WHERE "guest_channel_identity" IS NOT NULL AND "messaging_enabled" = true;

ALTER TABLE "booking_messaging_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_messaging_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_booking_messaging_profiles ON "booking_messaging_profiles"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "booking_messaging_profiles" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- Automation run ledger (idempotent Welcome / Arrival)
-- ---------------------------------------------------------------------------
CREATE TABLE "messaging_automation_runs" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "conversation_id" UUID,
  "trigger" VARCHAR(32) NOT NULL,
  "occurrence_key" VARCHAR(128) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  "scheduled_for" TIMESTAMPTZ,
  "message_id" UUID,
  "job_id" UUID,
  "error_code" VARCHAR(64),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  CONSTRAINT "messaging_automation_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messaging_automation_runs_trigger_check"
    CHECK ("trigger" IN (
      'welcome', 'arrival', 'confirmed', 'during_stay', 'checkout', 'post_stay'
    )),
  CONSTRAINT "messaging_automation_runs_status_check"
    CHECK ("status" IN (
      'scheduled', 'enqueued', 'sending', 'sent', 'failed', 'cancelled', 'skipped'
    )),
  CONSTRAINT "messaging_automation_runs_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messaging_automation_runs_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "messaging_automation_runs_booking_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messaging_automation_runs_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "messaging_automation_runs_message_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "messaging_automation_runs_booking_trigger_occ_uidx"
  ON "messaging_automation_runs"("booking_id", "trigger", "occurrence_key");
CREATE INDEX "messaging_automation_runs_status_scheduled_idx"
  ON "messaging_automation_runs"("status", "scheduled_for")
  WHERE "status" IN ('scheduled', 'enqueued');
CREATE INDEX "messaging_automation_runs_tenant_booking_idx"
  ON "messaging_automation_runs"("tenant_id", "booking_id");

ALTER TABLE "messaging_automation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messaging_automation_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_messaging_automation_runs ON "messaging_automation_runs"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "messaging_automation_runs" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- Unmatched inbound (orphan WhatsApp identity)
-- ---------------------------------------------------------------------------
CREATE TABLE "messaging_unmatched_inbounds" (
  "id" UUID NOT NULL,
  "platform_connection_id" UUID NOT NULL,
  "guest_channel_identity" VARCHAR(64) NOT NULL,
  "external_message_id" VARCHAR(255) NOT NULL,
  "body_preview" VARCHAR(280),
  "raw_meta_json" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" VARCHAR(32) NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messaging_unmatched_inbounds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messaging_unmatched_inbounds_status_check"
    CHECK ("status" IN ('open', 'resolved', 'ignored')),
  CONSTRAINT "messaging_unmatched_inbounds_connection_fkey"
    FOREIGN KEY ("platform_connection_id")
      REFERENCES "platform_messaging_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "messaging_unmatched_inbounds_ext_msg_uidx"
  ON "messaging_unmatched_inbounds"("external_message_id");
CREATE INDEX "messaging_unmatched_inbounds_identity_idx"
  ON "messaging_unmatched_inbounds"("guest_channel_identity", "created_at" DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON "messaging_unmatched_inbounds" TO talos_runtime;

-- Platform routing index (no RLS) — maps WA identity → tenant/booking for inbound.
-- Maintained by application when BookingMessagingProfile is upserted/disabled.
CREATE TABLE "messaging_wa_identity_routes" (
  "guest_channel_identity" VARCHAR(64) NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "profile_id" UUID NOT NULL,
  "conversation_id" UUID,
  "messaging_enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messaging_wa_identity_routes_pkey"
    PRIMARY KEY ("guest_channel_identity", "booking_id"),
  CONSTRAINT "messaging_wa_identity_routes_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "messaging_wa_identity_routes_identity_enabled_idx"
  ON "messaging_wa_identity_routes"("guest_channel_identity")
  WHERE "messaging_enabled" = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON "messaging_wa_identity_routes" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- Conversation WhatsApp identity + CSW
-- ---------------------------------------------------------------------------
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "guest_channel_identity" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "csw_open_until" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "last_guest_inbound_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "routing_status" VARCHAR(32) NOT NULL DEFAULT 'ok';

ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_routing_status_check";
ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_routing_status_check"
    CHECK ("routing_status" IN ('ok', 'ambiguous', 'unmatched'));

CREATE INDEX IF NOT EXISTS "conversations_guest_channel_identity_idx"
  ON "conversations"("tenant_id", "channel", "guest_channel_identity")
  WHERE "guest_channel_identity" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "conversations_wa_identity_status_idx"
  ON "conversations"("channel", "guest_channel_identity", "status")
  WHERE "channel" = 'whatsapp' AND "guest_channel_identity" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Message external id uniqueness (webhook / send idempotency)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "messages_tenant_external_message_uidx"
  ON "messages"("tenant_id", "external_message_id")
  WHERE "external_message_id" IS NOT NULL;
