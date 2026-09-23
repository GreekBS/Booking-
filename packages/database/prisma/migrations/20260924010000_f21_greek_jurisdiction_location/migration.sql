-- F2.1: establishment location for derived VAT jurisdiction (not free GR-ISLAND-REDUCED)
ALTER TABLE "business_fiscal_profiles"
  ADD COLUMN "establishment_location_id" VARCHAR(128) NOT NULL DEFAULT 'gr-mainland';

ALTER TABLE "business_fiscal_profiles"
  ADD COLUMN "establishment_in_eligible_area" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "business_fiscal_profiles"
  ADD COLUMN "service_physically_executed_in_eligible_area" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "business_fiscal_profiles_location_idx"
  ON "business_fiscal_profiles"("tenant_id", "establishment_location_id");
