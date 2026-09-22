-- CM-4c-3: durable Booking.com ARI push coalesce / generation ledger.
-- Additive only. Do not apply to Production from this batch.

CREATE TABLE "channel_ari_push_ledgers" (
  "tenant_id" UUID NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "coalesce_key" VARCHAR(512) NOT NULL,
  "highest_generation" BIGINT NOT NULL,
  "last_succeeded_generation" BIGINT,
  "pending_payload" JSONB,
  "last_ruid" VARCHAR(255),
  "last_outcome" VARCHAR(40),
  "last_error" TEXT,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "channel_ari_push_ledgers_pkey"
    PRIMARY KEY ("tenant_id", "connection_id", "coalesce_key"),
  CONSTRAINT "channel_ari_push_ledgers_highest_generation_check"
    CHECK ("highest_generation" >= 0),
  CONSTRAINT "channel_ari_push_ledgers_last_succeeded_generation_check"
    CHECK (
      "last_succeeded_generation" IS NULL
      OR "last_succeeded_generation" >= 0
    )
);

CREATE INDEX "channel_ari_push_ledgers_tenant_connection_idx"
  ON "channel_ari_push_ledgers" ("tenant_id", "connection_id");

ALTER TABLE "channel_ari_push_ledgers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_channel_ari_push_ledgers"
  ON "channel_ari_push_ledgers"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
