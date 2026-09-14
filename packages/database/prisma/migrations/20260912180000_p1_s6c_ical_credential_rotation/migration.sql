-- P1-S6c: durable iCal credential rotation command receipt.
-- Patterned after channel_semantic_transition_commands (tenant-scoped receipt +
-- RLS tenant isolation). Stores opaque credential references and non-secret
-- digests only: never feed URLs, tokens, or raw credential material.
--
-- Does NOT rotate anything by itself and does NOT activate Provider-1.

CREATE TYPE "ChannelIcalCredentialRotationStatus" AS ENUM (
  'in_progress',
  'committed',
  'failed',
  'abandoned'
);

CREATE TABLE "channel_ical_credential_rotation_commands" (
  "tenant_id" UUID NOT NULL,
  "operation" VARCHAR(80) NOT NULL,
  "command_id" VARCHAR(255) NOT NULL,

  "connection_id" VARCHAR(255) NOT NULL,
  "actor_id" UUID NOT NULL,

  "expected_semantic_config_version" INTEGER,
  "request_fingerprint" CHAR(64) NOT NULL,

  "status" "ChannelIcalCredentialRotationStatus" NOT NULL,

  "previous_credential_ref" VARCHAR(255),
  "new_credential_ref" VARCHAR(255),

  "previous_semantic_config_version" INTEGER,
  "resulting_semantic_config_version" INTEGER,
  "superseded_pending_count" INTEGER,
  "cursor_baseline_reset" BOOLEAN,

  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "vault_written_at" TIMESTAMPTZ,
  "committed_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,

  "failure_reason_code" VARCHAR(80),

  CONSTRAINT "channel_ical_credential_rotation_commands_pkey"
    PRIMARY KEY ("tenant_id", "operation", "command_id"),
  CONSTRAINT "channel_ical_credential_rotation_commands_expected_version_check"
    CHECK (
      "expected_semantic_config_version" IS NULL
      OR "expected_semantic_config_version" >= 1
    ),
  CONSTRAINT "channel_ical_credential_rotation_commands_previous_version_check"
    CHECK (
      "previous_semantic_config_version" IS NULL
      OR "previous_semantic_config_version" >= 1
    ),
  CONSTRAINT "channel_ical_credential_rotation_commands_resulting_version_check"
    CHECK (
      "resulting_semantic_config_version" IS NULL
      OR "resulting_semantic_config_version" >= 1
    ),
  CONSTRAINT "channel_ical_credential_rotation_commands_superseded_count_check"
    CHECK (
      "superseded_pending_count" IS NULL
      OR "superseded_pending_count" >= 0
    ),
  CONSTRAINT "channel_ical_credential_rotation_commands_fingerprint_check"
    CHECK ("request_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "channel_ical_credential_rotation_commands_tenant_conn_created_idx"
  ON "channel_ical_credential_rotation_commands"(
    "tenant_id",
    "connection_id",
    "created_at"
  );

-- At most one in-flight rotation per connection. Enforced in the database so a
-- concurrent operator cannot open a second epoch commit for the same feed.
CREATE UNIQUE INDEX "channel_ical_credential_rotation_commands_one_in_progress_uq"
  ON "channel_ical_credential_rotation_commands"(
    "tenant_id",
    "connection_id"
  )
  WHERE "status" = 'in_progress'::"ChannelIcalCredentialRotationStatus";

ALTER TABLE "channel_ical_credential_rotation_commands" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_channel_ical_credential_rotation_commands"
  ON "channel_ical_credential_rotation_commands"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
