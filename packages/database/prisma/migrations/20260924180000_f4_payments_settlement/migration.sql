-- F4: Settlement payments, allocations, reversals, refunds (ADR-027).
-- Concurrency / capacity gates use SELECT … FOR UPDATE inside application transactions;
-- no DB-level SUM CHECK constraints (misleading under concurrent writers).

CREATE TYPE "PaymentLifecycleStatus" AS ENUM (
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "PaymentMethodKind" AS ENUM (
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'OTA',
  'OTHER'
);

CREATE TYPE "PaymentCollectionSource" AS ENUM (
  'DIRECT',
  'PROPERTY',
  'OTA',
  'PAYMENT_GATEWAY',
  'OTHER'
);

CREATE TYPE "PaymentRefundStatus" AS ENUM (
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "payments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "status" "PaymentLifecycleStatus" NOT NULL,
  "method" "PaymentMethodKind" NOT NULL,
  "collection_source" "PaymentCollectionSource" NOT NULL,
  "external_reference" VARCHAR(255),
  "payer_name" VARCHAR(255),
  "booking_id" UUID,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "received_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0),
  CONSTRAINT "payments_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payments_booking_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key"
  ON "payments"("tenant_id", "idempotency_key");
CREATE INDEX "payments_tenant_id_received_at_idx"
  ON "payments"("tenant_id", "received_at");
CREATE INDEX "payments_tenant_id_booking_id_idx"
  ON "payments"("tenant_id", "booking_id");

CREATE TABLE "payment_allocations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "folio_id" UUID NOT NULL,
  "allocated_amount" DECIMAL(19,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_actor_id" UUID,
  "reason" VARCHAR(512),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_allocations_amount_chk" CHECK ("allocated_amount" > 0),
  CONSTRAINT "payment_allocations_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_allocations_payment_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_allocations_folio_fkey"
    FOREIGN KEY ("folio_id") REFERENCES "folios"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "payment_allocations_tenant_id_payment_id_idx"
  ON "payment_allocations"("tenant_id", "payment_id");
CREATE INDEX "payment_allocations_tenant_id_folio_id_idx"
  ON "payment_allocations"("tenant_id", "folio_id");

CREATE TABLE "payment_allocation_reversals" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "allocation_id" UUID NOT NULL,
  "reversed_amount" DECIMAL(19,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "reason" VARCHAR(512) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_actor_id" UUID,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "idempotency_key" VARCHAR(128),
  CONSTRAINT "payment_allocation_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_allocation_reversals_amount_chk" CHECK ("reversed_amount" > 0),
  CONSTRAINT "payment_allocation_reversals_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_allocation_reversals_payment_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_allocation_reversals_allocation_fkey"
    FOREIGN KEY ("allocation_id") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_allocation_reversals_tenant_idempotency_key"
  ON "payment_allocation_reversals"("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX "payment_allocation_reversals_tenant_id_allocation_id_idx"
  ON "payment_allocation_reversals"("tenant_id", "allocation_id");
CREATE INDEX "payment_allocation_reversals_tenant_id_payment_id_idx"
  ON "payment_allocation_reversals"("tenant_id", "payment_id");

CREATE TABLE "payment_refunds" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "payment_id" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "PaymentRefundStatus" NOT NULL,
  "reason" VARCHAR(512),
  "external_reference" VARCHAR(255),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_actor_id" UUID,
  CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_refunds_amount_chk" CHECK ("amount" > 0),
  CONSTRAINT "payment_refunds_tenant_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "payment_refunds_payment_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_refunds_tenant_id_idempotency_key_key"
  ON "payment_refunds"("tenant_id", "idempotency_key");
CREATE INDEX "payment_refunds_tenant_id_payment_id_idx"
  ON "payment_refunds"("tenant_id", "payment_id");

-- RLS
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payments_tenant_isolation" ON "payments"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_allocations_tenant_isolation" ON "payment_allocations"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE "payment_allocation_reversals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocation_reversals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_allocation_reversals_tenant_isolation" ON "payment_allocation_reversals"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_refunds" FORCE ROW LEVEL SECURITY;
CREATE POLICY "payment_refunds_tenant_isolation" ON "payment_refunds"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

-- Runtime role (created in F3.1 migration)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payments" TO talos_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payment_allocations" TO talos_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payment_allocation_reversals" TO talos_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "payment_refunds" TO talos_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO talos_runtime;
