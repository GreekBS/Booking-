-- Phase A: CSV reservation import persistence foundation.
-- Additive + backward-compatible. No Booking status changes.

-- ---------------------------------------------------------------------------
-- Booking supersede metadata (completed historical replacement)
-- ---------------------------------------------------------------------------
ALTER TABLE "bookings"
  ADD COLUMN "superseded_by_booking_id" UUID,
  ADD COLUMN "superseded_at" TIMESTAMPTZ,
  ADD COLUMN "supersede_reason" TEXT;

CREATE INDEX "bookings_tenant_id_superseded_by_booking_id_idx"
  ON "bookings"("tenant_id", "superseded_by_booking_id");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_superseded_by_booking_id_fkey"
  FOREIGN KEY ("superseded_by_booking_id") REFERENCES "bookings"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Import enums
-- ---------------------------------------------------------------------------
CREATE TYPE "ReservationImportBatchStatus" AS ENUM (
  'draft',
  'processing',
  'completed',
  'completed_with_errors',
  'failed',
  'expired',
  'cancelled'
);

CREATE TYPE "ReservationImportMissingPriceStrategy" AS ENUM (
  'undecided',
  'talos_for_all_missing',
  'per_row'
);

CREATE TYPE "ReservationImportRowStatus" AS ENUM (
  'pending',
  'ready',
  'imported',
  'replaced',
  'skipped',
  'skipped_already_imported',
  'failed',
  'discarded'
);

CREATE TYPE "ReservationImportTemporalClass" AS ENUM (
  'historical',
  'in_progress',
  'future'
);

CREATE TYPE "ReservationImportPriceSource" AS ENUM (
  'unresolved',
  'imported_csv',
  'talos_calculated',
  'operator_entered'
);

CREATE TYPE "ReservationImportConflictResolution" AS ENUM (
  'undecided',
  'keep_existing',
  'keep_csv'
);

-- ---------------------------------------------------------------------------
-- Reservation import batches
-- ---------------------------------------------------------------------------
CREATE TABLE "reservation_import_batches" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "source_namespace" VARCHAR(64) NOT NULL DEFAULT 'csv_reservation_import',
  "filename" VARCHAR(255) NOT NULL,
  "byte_size" INTEGER,
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "status" "ReservationImportBatchStatus" NOT NULL DEFAULT 'draft',
  "missing_price_strategy" "ReservationImportMissingPriceStrategy" NOT NULL DEFAULT 'undecided',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "committed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "reservation_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reservation_import_batches_tenant_status_expires_idx"
  ON "reservation_import_batches"("tenant_id", "status", "expires_at");

CREATE INDEX "reservation_import_batches_tenant_created_idx"
  ON "reservation_import_batches"("tenant_id", "created_at" DESC);

ALTER TABLE "reservation_import_batches"
  ADD CONSTRAINT "reservation_import_batches_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_import_batches"
  ADD CONSTRAINT "reservation_import_batches_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_import_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_import_batches" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_reservation_import_batches
  ON "reservation_import_batches"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "reservation_import_batches" TO talos_runtime;

-- ---------------------------------------------------------------------------
-- Reservation import rows
-- ---------------------------------------------------------------------------
CREATE TABLE "reservation_import_rows" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "source_namespace" VARCHAR(64) NOT NULL DEFAULT 'csv_reservation_import',
  "external_reference" VARCHAR(64) NOT NULL,
  "unit_id" UUID NOT NULL,
  "check_in" DATE NOT NULL,
  "check_out" DATE NOT NULL,
  "temporal_class" "ReservationImportTemporalClass" NOT NULL,
  "guest_name" VARCHAR(255) NOT NULL,
  "guest_email" VARCHAR(255) NOT NULL,
  "guest_phone" VARCHAR(50),
  "guest_count" INTEGER NOT NULL,
  "price_source" "ReservationImportPriceSource" NOT NULL DEFAULT 'unresolved',
  "imported_total_amount" DECIMAL(19, 4),
  "imported_currency" CHAR(3),
  "operator_total_amount" DECIMAL(19, 4),
  "operator_currency" CHAR(3),
  "conflict_resolution" "ReservationImportConflictResolution" NOT NULL DEFAULT 'undecided',
  "replace_booking_id" UUID,
  "conflict_snapshot" JSONB NOT NULL DEFAULT '{}',
  "conflict_group_id" VARCHAR(64),
  "recheck_required" BOOLEAN NOT NULL DEFAULT false,
  "status" "ReservationImportRowStatus" NOT NULL DEFAULT 'pending',
  "created_booking_id" UUID,
  "superseded_booking_id" UUID,
  "error_code" VARCHAR(64),
  "error_message" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "processed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "reservation_import_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_import_rows_batch_row_number_key" UNIQUE ("batch_id", "row_number"),
  CONSTRAINT "reservation_import_rows_guest_count_positive"
    CHECK ("guest_count" > 0),
  CONSTRAINT "reservation_import_rows_dates_valid"
    CHECK ("check_out" > "check_in")
);

-- Hard idempotency for durable successful import ownership only.
-- Draft/preflight rows may share the same external_reference across batches.
CREATE UNIQUE INDEX "reservation_import_rows_durable_external_ref_uidx"
  ON "reservation_import_rows"("tenant_id", "source_namespace", "external_reference")
  WHERE "status" IN ('imported', 'replaced', 'skipped_already_imported');

CREATE INDEX "reservation_import_rows_tenant_batch_idx"
  ON "reservation_import_rows"("tenant_id", "batch_id");

CREATE INDEX "reservation_import_rows_tenant_status_idx"
  ON "reservation_import_rows"("tenant_id", "status");

CREATE INDEX "reservation_import_rows_tenant_external_ref_idx"
  ON "reservation_import_rows"("tenant_id", "source_namespace", "external_reference");

ALTER TABLE "reservation_import_rows"
  ADD CONSTRAINT "reservation_import_rows_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_import_rows"
  ADD CONSTRAINT "reservation_import_rows_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "reservation_import_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_import_rows"
  ADD CONSTRAINT "reservation_import_rows_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reservation_import_rows"
  ADD CONSTRAINT "reservation_import_rows_replace_booking_id_fkey"
  FOREIGN KEY ("replace_booking_id") REFERENCES "bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservation_import_rows"
  ADD CONSTRAINT "reservation_import_rows_created_booking_id_fkey"
  FOREIGN KEY ("created_booking_id") REFERENCES "bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservation_import_rows"
  ADD CONSTRAINT "reservation_import_rows_superseded_booking_id_fkey"
  FOREIGN KEY ("superseded_booking_id") REFERENCES "bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reservation_import_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_import_rows" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_reservation_import_rows
  ON "reservation_import_rows"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "reservation_import_rows" TO talos_runtime;
