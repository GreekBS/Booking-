-- Direct Booking Phase 1: property-scoped public integrations

CREATE TYPE "DirectBookingIntegrationStatus" AS ENUM ('draft', 'active', 'disabled');

CREATE TABLE "direct_booking_integrations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "public_key_hash" VARCHAR(64) NOT NULL,
  "public_key_prefix" VARCHAR(32) NOT NULL,
  "environment" "PublishableKeyEnvironment" NOT NULL,
  "allowed_origins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "DirectBookingIntegrationStatus" NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "direct_booking_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "direct_booking_integrations_public_key_hash_key"
  ON "direct_booking_integrations"("public_key_hash");
CREATE INDEX "direct_booking_integrations_tenant_id_idx"
  ON "direct_booking_integrations"("tenant_id");
CREATE INDEX "direct_booking_integrations_tenant_id_property_id_idx"
  ON "direct_booking_integrations"("tenant_id", "property_id");
CREATE INDEX "direct_booking_integrations_status_idx"
  ON "direct_booking_integrations"("status");

ALTER TABLE "direct_booking_integrations"
  ADD CONSTRAINT "direct_booking_integrations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_booking_integrations"
  ADD CONSTRAINT "direct_booking_integrations_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_booking_integrations"
  ADD CONSTRAINT "direct_booking_integrations_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "direct_booking_integrations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "direct_booking_integrations_tenant_isolation" ON "direct_booking_integrations"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

ALTER TABLE "direct_booking_integrations" FORCE ROW LEVEL SECURITY;
