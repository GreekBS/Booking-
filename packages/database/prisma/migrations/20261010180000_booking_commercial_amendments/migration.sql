-- BFS-3a: durable booking commercial amendment foundation (additive only).
-- Does not alter bookings, quotes, folios, payments, or fiscal tables.

CREATE TABLE "booking_commercial_amendments" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "booking_id" UUID NOT NULL,
  "previous_quote_id" UUID NOT NULL,
  "new_quote_id" UUID NOT NULL,
  "previous_total_amount" DECIMAL(19,4) NOT NULL,
  "new_total_amount" DECIMAL(19,4) NOT NULL,
  "delta_amount" DECIMAL(19,4) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "pricing_intent" VARCHAR(64) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "actor_id" UUID NOT NULL,
  "mutation_origin" VARCHAR(64) NOT NULL,
  "confirmation_reference" VARCHAR(128) NOT NULL,
  "idempotency_key" VARCHAR(64) NOT NULL,
  "pricing_fingerprint" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_commercial_amendments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_commercial_amendments_tenant_id_idempotency_key_key"
  ON "booking_commercial_amendments"("tenant_id", "idempotency_key");

CREATE INDEX "booking_commercial_amendments_tenant_id_booking_id_created_at_idx"
  ON "booking_commercial_amendments"("tenant_id", "booking_id", "created_at");

CREATE INDEX "booking_commercial_amendments_tenant_id_property_id_created_at_idx"
  ON "booking_commercial_amendments"("tenant_id", "property_id", "created_at");

ALTER TABLE "booking_commercial_amendments"
  ADD CONSTRAINT "booking_commercial_amendments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_commercial_amendments"
  ADD CONSTRAINT "booking_commercial_amendments_tenant_id_property_id_fkey"
  FOREIGN KEY ("tenant_id", "property_id") REFERENCES "properties"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_commercial_amendments"
  ADD CONSTRAINT "booking_commercial_amendments_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_commercial_amendments"
  ADD CONSTRAINT "booking_commercial_amendments_previous_quote_id_fkey"
  FOREIGN KEY ("previous_quote_id") REFERENCES "quotes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_commercial_amendments"
  ADD CONSTRAINT "booking_commercial_amendments_new_quote_id_fkey"
  FOREIGN KEY ("new_quote_id") REFERENCES "quotes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "booking_commercial_amendments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "booking_commercial_amendments" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_booking_commercial_amendments
  ON "booking_commercial_amendments"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
