-- CM-4b S3a: semantic-mode persistence prerequisites.
-- This migration is infrastructure backfill only: it does not represent an
-- operator transition and must not write audit, cursor, Inbox, or Booking data.

CREATE TYPE "ChannelFeedSemanticMode" AS ENUM (
  'mixed_or_unknown_feed',
  'availability_block_feed',
  'reservation_feed'
);

CREATE TYPE "ChannelSemanticTransitionCommandStatus" AS ENUM (
  'pending',
  'committed'
);

-- Stage nullable columns, backfill existing rows fail-closed, then enforce the
-- permanent defaults and non-null invariants.
ALTER TABLE "channel_connections"
  ADD COLUMN "semantic_mode" "ChannelFeedSemanticMode",
  ADD COLUMN "semantic_config_version" INTEGER;

UPDATE "channel_connections"
SET
  "semantic_mode" = 'mixed_or_unknown_feed',
  "semantic_config_version" = 1
WHERE
  "semantic_mode" IS NULL
  OR "semantic_config_version" IS NULL;

ALTER TABLE "channel_connections"
  ALTER COLUMN "semantic_mode" SET DEFAULT 'mixed_or_unknown_feed',
  ALTER COLUMN "semantic_mode" SET NOT NULL,
  ALTER COLUMN "semantic_config_version" SET DEFAULT 1,
  ALTER COLUMN "semantic_config_version" SET NOT NULL;

ALTER TABLE "channel_connections"
  ADD CONSTRAINT "channel_connections_semantic_config_version_check"
  CHECK ("semantic_config_version" >= 1);

-- Audit resource IDs are domain identifiers, not universally UUIDs.
-- Existing UUID values convert losslessly to strings.
ALTER TABLE "audit_logs"
  ALTER COLUMN "resource_id" TYPE VARCHAR(255)
  USING "resource_id"::text;

-- Dedicated command execution receipt. Audit remains evidence and is not used
-- as the semantic-transition idempotency ledger.
CREATE TABLE "channel_semantic_transition_commands" (
  "tenant_id" UUID NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "command_id" VARCHAR(255) NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "actor_id" UUID NOT NULL,
  "expected_from_mode" "ChannelFeedSemanticMode" NOT NULL,
  "target_mode" "ChannelFeedSemanticMode" NOT NULL,
  "expected_semantic_config_version" INTEGER NOT NULL,
  "request_fingerprint" CHAR(64) NOT NULL,
  "status" "ChannelSemanticTransitionCommandStatus" NOT NULL,
  "previous_semantic_config_version" INTEGER,
  "resulting_semantic_config_version" INTEGER,
  "changed" BOOLEAN,
  "cursor_reset" BOOLEAN,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committed_at" TIMESTAMPTZ,

  CONSTRAINT "channel_semantic_transition_commands_pkey"
    PRIMARY KEY ("tenant_id", "operation", "command_id"),
  CONSTRAINT "channel_semantic_transition_commands_expected_version_check"
    CHECK ("expected_semantic_config_version" >= 1),
  CONSTRAINT "channel_semantic_transition_commands_previous_version_check"
    CHECK (
      "previous_semantic_config_version" IS NULL
      OR "previous_semantic_config_version" >= 1
    ),
  CONSTRAINT "channel_semantic_transition_commands_resulting_version_check"
    CHECK (
      "resulting_semantic_config_version" IS NULL
      OR "resulting_semantic_config_version" >= 1
    ),
  CONSTRAINT "channel_semantic_transition_commands_fingerprint_check"
    CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "channel_semantic_transition_commands_tenant_connection_created_idx"
  ON "channel_semantic_transition_commands"(
    "tenant_id",
    "connection_id",
    "created_at"
  );

ALTER TABLE "channel_semantic_transition_commands" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_channel_semantic_transition_commands"
  ON "channel_semantic_transition_commands"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
