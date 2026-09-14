-- P1-S6b: provider-owned channel_import ownership columns + partial unique identity.
-- Does NOT add channel_import to hold/booking EXCLUDE.
-- Does NOT mutate Bookings / Commerce reservation paths.

ALTER TABLE "unit_calendar_blocks"
  ADD COLUMN IF NOT EXISTS "connection_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "semantic_config_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "mapping_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "source_identity_key" VARCHAR(324),
  ADD COLUMN IF NOT EXISTS "entry_content_hash" CHAR(64),
  ADD COLUMN IF NOT EXISTS "identity_kind" VARCHAR(16);

ALTER TABLE "unit_calendar_blocks"
  DROP CONSTRAINT IF EXISTS "unit_calendar_blocks_channel_import_ownership_check";

ALTER TABLE "unit_calendar_blocks"
  ADD CONSTRAINT "unit_calendar_blocks_channel_import_ownership_check"
  CHECK (
    "block_type" <> 'channel_import'::"CalendarBlockType"
    OR (
      "connection_id" IS NOT NULL
      AND "semantic_config_version" IS NOT NULL
      AND "semantic_config_version" >= 1
      AND "mapping_id" IS NOT NULL
      AND "source_identity_key" IS NOT NULL
      AND char_length("source_identity_key") BETWEEN 1 AND 324
      AND "entry_content_hash" IS NOT NULL
      AND "entry_content_hash" ~ '^[0-9a-f]{64}$'
      AND "identity_kind" IN ('uid_only', 'uid_rid')
      AND "source_id" IS NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS "uq_channel_import_active_identity"
  ON "unit_calendar_blocks" (
    "tenant_id",
    "connection_id",
    "semantic_config_version",
    "mapping_id",
    "unit_id",
    "source_identity_key"
  )
  WHERE "block_type" = 'channel_import'::"CalendarBlockType"
    AND "status" = 'active'::"CalendarBlockStatus";

CREATE INDEX IF NOT EXISTS "unit_calendar_blocks_channel_import_lookup_idx"
  ON "unit_calendar_blocks" (
    "tenant_id",
    "connection_id",
    "mapping_id",
    "block_type",
    "status"
  );
