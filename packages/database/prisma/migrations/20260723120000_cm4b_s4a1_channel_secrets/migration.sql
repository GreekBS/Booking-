-- CM-4b S4a-1: durable sealed channel credential / webhook verification store.
-- Ciphertext only; plaintext never stored. No connection/semantic/Inbox changes.

CREATE TYPE "ChannelSecretKind" AS ENUM ('credential', 'webhook_verification');

CREATE TABLE "channel_secret_records" (
  "tenant_id" UUID NOT NULL,
  "id" UUID NOT NULL,
  "kind" "ChannelSecretKind" NOT NULL,
  "ciphertext" BYTEA NOT NULL,
  "key_version" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "deleted_at" TIMESTAMPTZ,

  CONSTRAINT "channel_secret_records_pkey"
    PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "channel_secret_records_key_version_check"
    CHECK ("key_version" >= 1)
);

CREATE INDEX "channel_secret_records_tenant_kind_idx"
  ON "channel_secret_records" ("tenant_id", "kind");

ALTER TABLE "channel_secret_records" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_channel_secret_records"
  ON "channel_secret_records"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
