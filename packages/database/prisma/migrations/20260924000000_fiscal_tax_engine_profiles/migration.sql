-- F2 Tax engine + fiscal profiles + Folio tax snapshots
-- Platform statutory TaxRules: tenant_id IS NULL (readable by all tenants via RLS)
-- Tenant commercial TaxRules / profiles: tenant-scoped RLS

CREATE TYPE "TaxRuleScope" AS ENUM ('platform_statutory', 'tenant_commercial');
CREATE TYPE "TaxType" AS ENUM ('vat', 'climate_resilience_fee', 'other_levy');
CREATE TYPE "TaxCalculationKind" AS ENUM (
  'PERCENTAGE',
  'FIXED_PER_NIGHT',
  'FIXED_PER_ROOM',
  'FIXED_PER_STAY',
  'PER_PERSON',
  'PER_PERSON_PER_NIGHT'
);
CREATE TYPE "TaxBasis" AS ENUM ('NET', 'GROSS', 'QUANTITY');
CREATE TYPE "CustomerBillingType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

CREATE TABLE "tax_rules" (
  "id" VARCHAR(128) NOT NULL,
  "tenant_id" UUID,
  "scope" "TaxRuleScope" NOT NULL,
  "country" CHAR(2) NOT NULL,
  "jurisdiction" VARCHAR(64) NOT NULL,
  "tax_type" "TaxType" NOT NULL,
  "classification_key" VARCHAR(128) NOT NULL,
  "charge_category" VARCHAR(64),
  "accommodation_type" VARCHAR(64),
  "property_classification" VARCHAR(64),
  "calculation_kind" "TaxCalculationKind" NOT NULL,
  "rate_percent" DECIMAL(19,4),
  "fixed_amount" DECIMAL(19,4),
  "currency" CHAR(3) NOT NULL,
  "basis" "TaxBasis" NOT NULL,
  "valid_from" TIMESTAMPTZ NOT NULL,
  "valid_until" TIMESTAMPTZ,
  "season_months" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "floor_area_min_sqm" INTEGER,
  "floor_area_max_exclusive_sqm" INTEGER,
  "legal_source" VARCHAR(512),
  "legal_version" VARCHAR(128),
  "priority" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tax_rules_scope_tenant_chk" CHECK (
    (scope = 'platform_statutory' AND tenant_id IS NULL)
    OR (scope = 'tenant_commercial' AND tenant_id IS NOT NULL)
  )
);

CREATE INDEX "tax_rules_lookup_idx"
  ON "tax_rules"("country", "jurisdiction", "tax_type", "classification_key", "valid_from");
CREATE INDEX "tax_rules_tenant_id_idx" ON "tax_rules"("tenant_id");
CREATE INDEX "tax_rules_effective_idx" ON "tax_rules"("valid_from", "valid_until");

CREATE TABLE "business_fiscal_profiles" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "legal_name" VARCHAR(255) NOT NULL,
  "trade_name" VARCHAR(255),
  "country" CHAR(2) NOT NULL,
  "vat_number" VARCHAR(32),
  "address_line1" VARCHAR(255) NOT NULL,
  "address_line2" VARCHAR(255),
  "address_city" VARCHAR(128) NOT NULL,
  "address_region" VARCHAR(128),
  "address_postal_code" VARCHAR(32) NOT NULL,
  "address_country" CHAR(2) NOT NULL,
  "fiscal_jurisdiction" VARCHAR(64) NOT NULL,
  "establishment_code" VARCHAR(64),
  "accommodation_type" VARCHAR(64) NOT NULL,
  "property_classification" VARCHAR(64),
  "floor_area_sqm" INTEGER,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_fiscal_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_fiscal_profiles_tenant_property_uq"
  ON "business_fiscal_profiles"("tenant_id", "property_id");
CREATE INDEX "business_fiscal_profiles_tenant_id_idx"
  ON "business_fiscal_profiles"("tenant_id");
CREATE UNIQUE INDEX "business_fiscal_profiles_tenant_vat_uq"
  ON "business_fiscal_profiles"("tenant_id", "vat_number")
  WHERE "vat_number" IS NOT NULL;

CREATE TABLE "customer_billing_profiles" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "type" "CustomerBillingType" NOT NULL,
  "legal_name" VARCHAR(255) NOT NULL,
  "vat_number" VARCHAR(32),
  "country" CHAR(2) NOT NULL,
  "address_line1" VARCHAR(255) NOT NULL,
  "address_line2" VARCHAR(255),
  "address_city" VARCHAR(128) NOT NULL,
  "address_region" VARCHAR(128),
  "address_postal_code" VARCHAR(32) NOT NULL,
  "address_country" CHAR(2) NOT NULL,
  "email" VARCHAR(255),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_billing_profiles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_billing_profiles_tenant_id_idx"
  ON "customer_billing_profiles"("tenant_id");
CREATE UNIQUE INDEX "customer_billing_profiles_tenant_vat_uq"
  ON "customer_billing_profiles"("tenant_id", "vat_number")
  WHERE "vat_number" IS NOT NULL;

ALTER TABLE "folio_lines"
  ADD COLUMN "tax_snapshot" JSONB;

ALTER TABLE "tax_rules"
  ADD CONSTRAINT "tax_rules_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_fiscal_profiles"
  ADD CONSTRAINT "business_fiscal_profiles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "business_fiscal_profiles"
  ADD CONSTRAINT "business_fiscal_profiles_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_billing_profiles"
  ADD CONSTRAINT "customer_billing_profiles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tax_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "business_fiscal_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_fiscal_profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "customer_billing_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_billing_profiles" FORCE ROW LEVEL SECURITY;

-- Platform statutory rules (tenant_id IS NULL) are readable by any tenant session;
-- tenant commercial rows require matching tenant GUC.
CREATE POLICY tenant_isolation_tax_rules ON tax_rules
  USING (
    tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE POLICY tenant_isolation_business_fiscal_profiles ON business_fiscal_profiles
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_customer_billing_profiles ON customer_billing_profiles
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
