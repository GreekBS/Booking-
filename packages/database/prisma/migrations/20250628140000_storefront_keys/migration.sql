-- Storefront publishable keys and idempotency (Phase 3B)

CREATE TYPE "PublishableKeyEnvironment" AS ENUM ('test', 'live');

CREATE TABLE "tenant_publishable_keys" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "key_hash" VARCHAR(64) NOT NULL,
  "key_prefix" VARCHAR(32) NOT NULL,
  "environment" "PublishableKeyEnvironment" NOT NULL,
  "allowed_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tenant_publishable_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_publishable_keys_key_hash_key" ON "tenant_publishable_keys"("key_hash");
CREATE INDEX "tenant_publishable_keys_tenant_id_idx" ON "tenant_publishable_keys"("tenant_id");

CREATE TABLE "storefront_idempotency_records" (
  "tenant_id" UUID NOT NULL,
  "scope" VARCHAR(20) NOT NULL,
  "idempotency_key" VARCHAR(64) NOT NULL,
  "resource_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "storefront_idempotency_records_pkey" PRIMARY KEY ("tenant_id", "scope", "idempotency_key")
);

CREATE INDEX "storefront_idempotency_records_expires_at_idx" ON "storefront_idempotency_records"("expires_at");

ALTER TABLE "tenant_publishable_keys"
  ADD CONSTRAINT "tenant_publishable_keys_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storefront_idempotency_records"
  ADD CONSTRAINT "storefront_idempotency_records_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_publishable_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storefront_idempotency_records" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_publishable_keys_tenant_isolation" ON "tenant_publishable_keys"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "storefront_idempotency_records_tenant_isolation" ON "storefront_idempotency_records"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE "tenant_publishable_keys" FORCE ROW LEVEL SECURITY;
ALTER TABLE "storefront_idempotency_records" FORCE ROW LEVEL SECURITY;
