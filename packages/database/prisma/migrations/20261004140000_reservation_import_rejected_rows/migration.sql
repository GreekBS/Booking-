-- B3.3a: durable create-time rejected CSV import rows (diagnostics only).

CREATE TABLE "reservation_import_rejected_rows" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "batch_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "errors" JSONB NOT NULL DEFAULT '[]',
  "warnings" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reservation_import_rejected_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reservation_import_rejected_rows_batch_row_number_key"
    UNIQUE ("batch_id", "row_number")
);

CREATE INDEX "reservation_import_rejected_rows_tenant_batch_idx"
  ON "reservation_import_rejected_rows"("tenant_id", "batch_id");

ALTER TABLE "reservation_import_rejected_rows"
  ADD CONSTRAINT "reservation_import_rejected_rows_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_import_rejected_rows"
  ADD CONSTRAINT "reservation_import_rejected_rows_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "reservation_import_batches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reservation_import_rejected_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reservation_import_rejected_rows" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_reservation_import_rejected_rows
  ON "reservation_import_rejected_rows"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "reservation_import_rejected_rows" TO talos_runtime;
