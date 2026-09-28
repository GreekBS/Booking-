-- Workerless Welcome Email → WhatsApp contact-token activation (additive).
-- Does not touch Units / RatePlans / Channel Manager / fiscal / worker activation.

-- ---------------------------------------------------------------------------
-- Property settings: Welcome Email (primary V1) vs future scheduled WA templates
-- ---------------------------------------------------------------------------
ALTER TABLE "property_messaging_settings"
  ADD COLUMN IF NOT EXISTS "welcome_email_enabled" BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- Booking messaging profile: Welcome Email delivery state
-- ---------------------------------------------------------------------------
ALTER TABLE "booking_messaging_profiles"
  ADD COLUMN IF NOT EXISTS "welcome_email_status" VARCHAR(32) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "welcome_email_to" VARCHAR(320),
  ADD COLUMN IF NOT EXISTS "welcome_email_sent_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "welcome_email_last_error" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "welcome_email_occurrence_key" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "active_contact_token_id" UUID;

ALTER TABLE "booking_messaging_profiles"
  DROP CONSTRAINT IF EXISTS "booking_messaging_profiles_welcome_email_status_check";
ALTER TABLE "booking_messaging_profiles"
  ADD CONSTRAINT "booking_messaging_profiles_welcome_email_status_check"
  CHECK ("welcome_email_status" IN (
    'none', 'unavailable', 'pending', 'sent', 'failed'
  ));

-- ---------------------------------------------------------------------------
-- Opaque guest messaging contact tokens (hash-at-rest)
-- Lookup by token_hash is platform/service-path (webhook); rows are tenant-scoped.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "messaging_contact_tokens" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "guest_id" UUID,
  "profile_id" UUID,
  "token_hash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "activated_at" TIMESTAMPTZ,
  "activated_conversation_id" UUID,
  "activated_wa_identity" VARCHAR(64),
  "revoked_at" TIMESTAMPTZ,
  "revoke_reason" VARCHAR(64),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messaging_contact_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messaging_contact_tokens_status_check"
    CHECK ("status" IN ('active', 'activated', 'revoked', 'expired')),
  CONSTRAINT "messaging_contact_tokens_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messaging_contact_tokens_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "messaging_contact_tokens_booking_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messaging_contact_tokens_guest_fkey"
    FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "messaging_contact_tokens_profile_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "booking_messaging_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "messaging_contact_tokens_token_hash_uidx"
  ON "messaging_contact_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "messaging_contact_tokens_booking_idx"
  ON "messaging_contact_tokens"("tenant_id", "booking_id");
CREATE INDEX IF NOT EXISTS "messaging_contact_tokens_active_booking_idx"
  ON "messaging_contact_tokens"("booking_id", "status")
  WHERE "status" = 'active';

ALTER TABLE "messaging_contact_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messaging_contact_tokens" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_messaging_contact_tokens ON "messaging_contact_tokens";
-- Service/webhook path may SELECT by opaque hash with no tenant GUC.
-- Tenant-scoped writes always require matching app.current_tenant.
CREATE POLICY tenant_isolation_messaging_contact_tokens ON "messaging_contact_tokens"
  USING (
    CASE
      WHEN NULLIF(current_setting('app.current_tenant', true), '') IS NULL THEN true
      ELSE tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
    END
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
GRANT SELECT, INSERT, UPDATE, DELETE ON "messaging_contact_tokens" TO talos_runtime;

-- Allow email_token contact source (Welcome Email activation path)
ALTER TABLE "booking_messaging_profiles"
  DROP CONSTRAINT IF EXISTS "booking_messaging_profiles_contact_source_check";
ALTER TABLE "booking_messaging_profiles"
  ADD CONSTRAINT "booking_messaging_profiles_contact_source_check"
  CHECK ("contact_source" IN (
    'manual', 'snapshot_prefill', 'crm_prefill', 'email_token'
  ));
