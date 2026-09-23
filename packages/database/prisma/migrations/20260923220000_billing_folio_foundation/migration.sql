-- F1 Billing / Folio foundation
CREATE TYPE "FolioStatus" AS ENUM ('open', 'closed');
CREATE TYPE "FolioLineType" AS ENUM (
  'accommodation',
  'extra',
  'service',
  'discount',
  'adjustment',
  'fee',
  'tax'
);

CREATE TABLE "folios" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "folio_key" VARCHAR(64) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "FolioStatus" NOT NULL DEFAULT 'open',
  "label" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "folios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "folio_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "folio_id" UUID NOT NULL,
  "line_type" "FolioLineType" NOT NULL,
  "description" VARCHAR(512) NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "source_type" VARCHAR(64) NOT NULL,
  "source_id" VARCHAR(255) NOT NULL,
  "source_line_ref" VARCHAR(255),
  "sort_order" INTEGER NOT NULL,
  "posted_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "folio_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "folios_tenant_id_booking_id_folio_key_key"
  ON "folios"("tenant_id", "booking_id", "folio_key");

CREATE INDEX "folios_tenant_id_booking_id_idx"
  ON "folios"("tenant_id", "booking_id");

CREATE INDEX "folio_lines_tenant_id_folio_id_sort_order_idx"
  ON "folio_lines"("tenant_id", "folio_id", "sort_order");

-- Prevent duplicate projection of the same commercial source into one folio.
CREATE UNIQUE INDEX "folio_lines_tenant_folio_source_uq"
  ON "folio_lines"("tenant_id", "folio_id", "source_type", "source_id", "source_line_ref");

ALTER TABLE "folios"
  ADD CONSTRAINT "folios_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "folios"
  ADD CONSTRAINT "folios_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "folio_lines"
  ADD CONSTRAINT "folio_lines_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "folio_lines"
  ADD CONSTRAINT "folio_lines_folio_id_fkey"
  FOREIGN KEY ("folio_id") REFERENCES "folios"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "folios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "folios" FORCE ROW LEVEL SECURITY;
ALTER TABLE "folio_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "folio_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_folios ON folios
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_folio_lines ON folio_lines
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
