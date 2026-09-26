-- CRM-1: Guest identity foundation (tenant-owned CRM).
-- Additive only. Email/phone intentionally NOT unique.
-- Booking contact snapshots (guest_name/email/phone) remain authoritative for stay history.

CREATE TABLE "guests" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "display_name" VARCHAR(255) NOT NULL,
  "first_name" VARCHAR(128),
  "last_name" VARCHAR(128),
  "email" VARCHAR(255),
  "email_normalized" VARCHAR(255),
  "phone" VARCHAR(50),
  "phone_normalized" VARCHAR(32),
  "country" CHAR(2),
  "preferred_language" VARCHAR(16),
  "archived_at" TIMESTAMPTZ,
  "merged_into_guest_id" UUID,
  "anonymized_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guests_tenant_id_email_normalized_idx"
  ON "guests"("tenant_id", "email_normalized");
CREATE INDEX "guests_tenant_id_phone_normalized_idx"
  ON "guests"("tenant_id", "phone_normalized");
CREATE INDEX "guests_tenant_id_display_name_idx"
  ON "guests"("tenant_id", "display_name");
CREATE INDEX "guests_tenant_id_archived_at_idx"
  ON "guests"("tenant_id", "archived_at");

ALTER TABLE "guests"
  ADD CONSTRAINT "guests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guests"
  ADD CONSTRAINT "guests_merged_into_guest_id_fkey"
  FOREIGN KEY ("merged_into_guest_id") REFERENCES "guests"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bookings"
  ADD COLUMN "guest_id" UUID;

CREATE INDEX "bookings_tenant_id_guest_id_idx"
  ON "bookings"("tenant_id", "guest_id");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_guest_id_fkey"
  FOREIGN KEY ("guest_id") REFERENCES "guests"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "guests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guests" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_guests ON guests
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "guests" TO talos_runtime;
