-- CM-3c: Channel ingress inbox

CREATE TYPE "ChannelInboxProcessingStatus" AS ENUM (
  'received',
  'processing',
  'completed',
  'duplicate',
  'skipped',
  'failed',
  'dead_letter'
);

CREATE TYPE "ChannelInboxProcessingOutcome" AS ENUM (
  'SUCCESS',
  'DUPLICATE',
  'AVAILABILITY_CONFLICT',
  'VALIDATION_ERROR',
  'PROVIDER_ERROR',
  'UNSUPPORTED',
  'STALE_MAPPING',
  'TRANSIENT_ERROR',
  'INTERNAL_ERROR'
);

CREATE TYPE "ChannelInboxIngressKind" AS ENUM ('webhook', 'poll', 'replay', 'manual');

CREATE TABLE "channel_inbox_items" (
  "tenant_id" UUID NOT NULL,
  "id" VARCHAR(255) NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "ingress_kind" "ChannelInboxIngressKind" NOT NULL,
  "message_kind" VARCHAR(50) NOT NULL,
  "provider_event_id" VARCHAR(255) NOT NULL,
  "deduplication_key" VARCHAR(500) NOT NULL,
  "correlation_id" VARCHAR(255),
  "raw_payload" JSONB NOT NULL,
  "external_listing_id" VARCHAR(255),
  "external_unit_id" VARCHAR(255),
  "external_reservation_id" VARCHAR(255),
  "external_revision" VARCHAR(255),
  "provider_revision" VARCHAR(255),
  "provider_sequence" VARCHAR(255),
  "provider_event_time" TIMESTAMPTZ,
  "received_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "status" "ChannelInboxProcessingStatus" NOT NULL DEFAULT 'received',
  "outcome" "ChannelInboxProcessingOutcome",
  "outcome_detail" TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "lease_owner" VARCHAR(255),
  "lease_expires_at" TIMESTAMPTZ,
  "lease_heartbeat_at" TIMESTAMPTZ,
  "processing_token" VARCHAR(255),
  "processing_started_at" TIMESTAMPTZ,
  "processed_at" TIMESTAMPTZ,
  "result_booking_id" VARCHAR(255),
  "result_link_id" VARCHAR(255),
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "channel_inbox_items_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE UNIQUE INDEX "channel_inbox_items_tenant_id_deduplication_key_key"
  ON "channel_inbox_items"("tenant_id", "deduplication_key");

CREATE INDEX "channel_inbox_items_status_lease_expires_at_created_at_idx"
  ON "channel_inbox_items"("status", "lease_expires_at", "created_at");

CREATE INDEX "channel_inbox_items_tenant_id_connection_id_created_at_idx"
  ON "channel_inbox_items"("tenant_id", "connection_id", "created_at");
