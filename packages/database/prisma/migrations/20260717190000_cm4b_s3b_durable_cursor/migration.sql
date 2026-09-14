-- CM-4b S3b: narrow provider-neutral durable cursor foundation.
-- This migration creates persistence only. It does not create or reset cursor
-- state and does not change semantic, lifecycle, audit, Inbox, or Booking data.

CREATE TABLE "channel_poll_cursors" (
  "tenant_id" UUID NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "payload" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "semantic_config_version" INTEGER NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "channel_poll_cursors_pkey"
    PRIMARY KEY ("tenant_id", "connection_id"),
  CONSTRAINT "channel_poll_cursors_version_check"
    CHECK ("version" >= 1),
  CONSTRAINT "channel_poll_cursors_semantic_config_version_check"
    CHECK ("semantic_config_version" >= 1),
  CONSTRAINT "channel_poll_cursors_connection_fkey"
    FOREIGN KEY ("tenant_id", "connection_id")
    REFERENCES "channel_connections"("tenant_id", "id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

ALTER TABLE "channel_poll_cursors" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_channel_poll_cursors"
  ON "channel_poll_cursors"
  USING (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  )
  WITH CHECK (
    "tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );
