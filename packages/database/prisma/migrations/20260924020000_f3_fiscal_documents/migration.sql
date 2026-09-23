-- F3: Fiscal documents, series, atomic numbering, allocations
-- Local issuance only — no AADE/myDATA transmission tables.

CREATE TABLE "fiscal_series" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "document_kind" VARCHAR(64) NOT NULL,
  "series_code" VARCHAR(32) NOT NULL,
  "next_sequence" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "label" VARCHAR(255),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_series_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_series_next_sequence_chk" CHECK ("next_sequence" >= 1),
  CONSTRAINT "fiscal_series_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fiscal_series_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "fiscal_series_tenant_property_kind_code_key"
  ON "fiscal_series"("tenant_id", "property_id", "document_kind", "series_code");
CREATE INDEX "fiscal_series_tenant_id_idx" ON "fiscal_series"("tenant_id");
CREATE INDEX "fiscal_series_lookup_idx"
  ON "fiscal_series"("tenant_id", "property_id", "document_kind", "active");

CREATE TABLE "fiscal_documents" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "document_kind" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "series_id" UUID,
  "series_code" VARCHAR(32),
  "sequence_number" INTEGER,
  "issuance_idempotency_key" VARCHAR(128),
  "issued_at" TIMESTAMPTZ,
  "currency" CHAR(3) NOT NULL,
  "issuer_snapshot" JSONB NOT NULL,
  "customer_snapshot" JSONB,
  "net_total" DECIMAL(19,4) NOT NULL,
  "vat_total" DECIMAL(19,4) NOT NULL,
  "other_tax_total" DECIMAL(19,4) NOT NULL,
  "levy_total" DECIMAL(19,4) NOT NULL,
  "gross_total" DECIMAL(19,4) NOT NULL,
  "rounding_policy" VARCHAR(64) NOT NULL DEFAULT 'deterministic_money_4dp',
  "payment_method_summary" VARCHAR(255),
  "source_booking_id" UUID,
  "original_document_id" UUID,
  "credit_reason" VARCHAR(512),
  "credited_scope" VARCHAR(16),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_documents_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documents_property_fkey"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documents_series_fkey"
    FOREIGN KEY ("series_id") REFERENCES "fiscal_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documents_original_fkey"
    FOREIGN KEY ("original_document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "fiscal_documents_issued_shape_chk" CHECK (
    ("status" = 'DRAFT' AND "sequence_number" IS NULL AND "issued_at" IS NULL)
    OR ("status" <> 'DRAFT')
  )
);

CREATE UNIQUE INDEX "fiscal_documents_tenant_series_sequence_key"
  ON "fiscal_documents"("tenant_id", "series_id", "sequence_number");
CREATE UNIQUE INDEX "fiscal_documents_tenant_idempotency_key"
  ON "fiscal_documents"("tenant_id", "issuance_idempotency_key");
CREATE INDEX "fiscal_documents_tenant_issued_idx"
  ON "fiscal_documents"("tenant_id", "issued_at");
CREATE INDEX "fiscal_documents_tenant_property_status_idx"
  ON "fiscal_documents"("tenant_id", "property_id", "status");
CREATE INDEX "fiscal_documents_tenant_booking_idx"
  ON "fiscal_documents"("tenant_id", "source_booking_id");
CREATE INDEX "fiscal_documents_tenant_original_idx"
  ON "fiscal_documents"("tenant_id", "original_document_id");

CREATE TABLE "fiscal_document_lines" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "fiscal_document_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "description" VARCHAR(512) NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "unit" VARCHAR(64),
  "net_amount" DECIMAL(19,4) NOT NULL,
  "vat_amount" DECIMAL(19,4) NOT NULL,
  "levy_amount" DECIMAL(19,4) NOT NULL,
  "gross_amount" DECIMAL(19,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "classification_key" VARCHAR(128),
  "tax_snapshot" JSONB,
  "source_folio_id" UUID,
  "source_folio_line_id" UUID,
  "daily_use_provenance" JSONB,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_document_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_document_lines_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fiscal_document_lines_document_fkey"
    FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "fiscal_document_lines_doc_idx"
  ON "fiscal_document_lines"("tenant_id", "fiscal_document_id");
CREATE INDEX "fiscal_document_lines_folio_line_idx"
  ON "fiscal_document_lines"("tenant_id", "source_folio_line_id");

CREATE TABLE "fiscal_line_allocations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "folio_id" UUID NOT NULL,
  "folio_line_id" UUID NOT NULL,
  "fiscal_document_id" UUID NOT NULL,
  "fiscal_document_line_id" UUID NOT NULL,
  "allocated_amount" DECIMAL(19,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fiscal_line_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fiscal_line_allocations_amount_chk" CHECK ("allocated_amount" > 0),
  CONSTRAINT "fiscal_line_allocations_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fiscal_line_allocations_document_fkey"
    FOREIGN KEY ("fiscal_document_id") REFERENCES "fiscal_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fiscal_line_allocations_line_fkey"
    FOREIGN KEY ("fiscal_document_line_id") REFERENCES "fiscal_document_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "fiscal_line_allocations_folio_idx"
  ON "fiscal_line_allocations"("tenant_id", "folio_id");
CREATE INDEX "fiscal_line_allocations_folio_line_idx"
  ON "fiscal_line_allocations"("tenant_id", "folio_line_id");
CREATE INDEX "fiscal_line_allocations_document_idx"
  ON "fiscal_line_allocations"("tenant_id", "fiscal_document_id");

-- RLS
ALTER TABLE "fiscal_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_series" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_series_tenant_isolation" ON "fiscal_series"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE "fiscal_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_documents_tenant_isolation" ON "fiscal_documents"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE "fiscal_document_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_document_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_document_lines_tenant_isolation" ON "fiscal_document_lines"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE "fiscal_line_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_line_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "fiscal_line_allocations_tenant_isolation" ON "fiscal_line_allocations"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Issued financial body immutability (application bugs must not rewrite invoices).
-- DRAFT rows remain updatable/deletable. Lifecycle-only future columns can be extended carefully.
CREATE OR REPLACE FUNCTION prevent_issued_fiscal_document_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'ISSUED' THEN
      RAISE EXCEPTION 'ISSUED fiscal_documents cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'ISSUED' THEN
    -- Allow only non-financial metadata/status extensions that do not rewrite money/identity.
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.property_id IS DISTINCT FROM OLD.property_id
      OR NEW.document_kind IS DISTINCT FROM OLD.document_kind
      OR NEW.series_id IS DISTINCT FROM OLD.series_id
      OR NEW.series_code IS DISTINCT FROM OLD.series_code
      OR NEW.sequence_number IS DISTINCT FROM OLD.sequence_number
      OR NEW.issuance_idempotency_key IS DISTINCT FROM OLD.issuance_idempotency_key
      OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.issuer_snapshot IS DISTINCT FROM OLD.issuer_snapshot
      OR NEW.customer_snapshot IS DISTINCT FROM OLD.customer_snapshot
      OR NEW.net_total IS DISTINCT FROM OLD.net_total
      OR NEW.vat_total IS DISTINCT FROM OLD.vat_total
      OR NEW.other_tax_total IS DISTINCT FROM OLD.other_tax_total
      OR NEW.levy_total IS DISTINCT FROM OLD.levy_total
      OR NEW.gross_total IS DISTINCT FROM OLD.gross_total
      OR NEW.rounding_policy IS DISTINCT FROM OLD.rounding_policy
      OR NEW.payment_method_summary IS DISTINCT FROM OLD.payment_method_summary
      OR NEW.source_booking_id IS DISTINCT FROM OLD.source_booking_id
      OR NEW.original_document_id IS DISTINCT FROM OLD.original_document_id
      OR NEW.credit_reason IS DISTINCT FROM OLD.credit_reason
      OR NEW.credited_scope IS DISTINCT FROM OLD.credited_scope
    THEN
      RAISE EXCEPTION 'ISSUED fiscal_documents financial/legal body is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fiscal_documents_issued_immutable
  BEFORE UPDATE OR DELETE ON "fiscal_documents"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_issued_fiscal_document_mutation();

CREATE OR REPLACE FUNCTION prevent_issued_fiscal_document_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  doc_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO doc_status FROM fiscal_documents WHERE id = OLD.fiscal_document_id;
    IF doc_status = 'ISSUED' THEN
      RAISE EXCEPTION 'Lines of ISSUED fiscal_documents cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO doc_status FROM fiscal_documents WHERE id = NEW.fiscal_document_id;
    IF doc_status = 'ISSUED' THEN
      RAISE EXCEPTION 'Lines of ISSUED fiscal_documents cannot be updated';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT status INTO doc_status FROM fiscal_documents WHERE id = NEW.fiscal_document_id;
    IF doc_status = 'ISSUED' THEN
      -- Allow insert only during the same issue transaction when status is already ISSUED
      -- is not permitted after commit; issue path inserts lines while still transitioning.
      -- IssueAtomic inserts lines after setting ISSUED in same TX — so INSERT must be allowed
      -- when the document was just created as ISSUED in this transaction.
      -- Practical approach: block UPDATE/DELETE only; INSERT allowed (issue path).
      NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER fiscal_document_lines_issued_immutable
  BEFORE UPDATE OR DELETE ON "fiscal_document_lines"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_issued_fiscal_document_line_mutation();
