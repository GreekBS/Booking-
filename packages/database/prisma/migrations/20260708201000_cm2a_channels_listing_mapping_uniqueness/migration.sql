-- CM-2a: enforce uniqueness for ChannelListingMapping external identifiers

-- Non-null external_unit_id uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS channel_listing_mappings_uq_ext_unit
  ON "channel_listing_mappings"("tenant_id","connection_id","external_listing_id","external_unit_id")
  WHERE "external_unit_id" IS NOT NULL;

-- NULL external_unit_id uniqueness (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS channel_listing_mappings_uq_no_unit
  ON "channel_listing_mappings"("tenant_id","connection_id","external_listing_id")
  WHERE "external_unit_id" IS NULL;

