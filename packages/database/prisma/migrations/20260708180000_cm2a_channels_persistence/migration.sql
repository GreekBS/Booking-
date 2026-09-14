-- CM-2a: Channel Manager persistence foundation (channels aggregates)

-- CreateEnum
CREATE TYPE "ChannelConnectionStatus" AS ENUM ('draft', 'pending_auth', 'active', 'paused', 'error', 'disconnected');

-- CreateEnum
CREATE TYPE "ChannelListingMappingStatus" AS ENUM ('active', 'paused', 'unmapped', 'error', 'archived');

-- CreateEnum
CREATE TYPE "ExternalReservationLinkStatus" AS ENUM ('linked', 'stale', 'conflict', 'archived');

-- CreateEnum
CREATE TYPE "ChannelSyncDirection" AS ENUM ('inbound', 'outbound', 'bidirectional');

-- CreateTable
CREATE TABLE "channel_connections" (
  "tenant_id" UUID NOT NULL,
  "id" VARCHAR(255) NOT NULL,
  "provider" VARCHAR(50) NOT NULL,
  "display_name" VARCHAR(255) NOT NULL,
  "status" "ChannelConnectionStatus" NOT NULL,
  "credential_ref" VARCHAR(255),
  "webhook_verification_ref" VARCHAR(255),
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "channel_connections_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateIndex
CREATE INDEX "channel_connections_tenant_id_status_idx" ON "channel_connections"("tenant_id","status");

-- CreateTable
CREATE TABLE "channel_listing_mappings" (
  "tenant_id" UUID NOT NULL,
  "id" VARCHAR(255) NOT NULL,
  "connection_id" VARCHAR(255) NOT NULL,
  "external_listing_id" VARCHAR(255) NOT NULL,
  "external_unit_id" VARCHAR(255),
  "property_id" VARCHAR(255) NOT NULL,
  "unit_id" VARCHAR(255) NOT NULL,
  "sync_direction" "ChannelSyncDirection" NOT NULL,
  "status" "ChannelListingMappingStatus" NOT NULL,
  "mapping_version" INTEGER NOT NULL,
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "channel_listing_mappings_pkey" PRIMARY KEY ("tenant_id","id")
);

-- CreateIndex
CREATE INDEX "channel_listing_mappings_tenant_id_connection_id_idx" ON "channel_listing_mappings"("tenant_id","connection_id");

-- CreateIndex
CREATE INDEX "channel_listing_mappings_tenant_id_connection_id_external_listing_id_external_unit_id_idx" ON "channel_listing_mappings"("tenant_id","connection_id","external_listing_id","external_unit_id");

-- CreateIndex (Prisma nullable uniqueness - NULLs do not collide in Postgres)
CREATE UNIQUE INDEX "channel_listing_mappings_tenant_id_connection_id_external_listing_id_external_unit_id_key" ON "channel_listing_mappings"("tenant_id","connection_id","external_listing_id","external_unit_id");

-- Partial unique index to prevent duplicates when external_unit_id IS NULL
CREATE UNIQUE INDEX "channel_listing_mappings_tenant_id_connection_id_external_listing_id_unit_null_key" ON "channel_listing_mappings"("tenant_id","connection_id","external_listing_id") WHERE "external_unit_id" IS NULL;

-- CreateTable
CREATE TABLE "external_reservation_links" (
  "tenant_id" UUID NOT NULL,
  "id" VARCHAR(255) NOT NULL,
  "provider" VARCHAR(50) NOT NULL,

  "connection_id" VARCHAR(255) NOT NULL,
  "external_reservation_id" VARCHAR(255) NOT NULL,
  "booking_id" VARCHAR(255) NOT NULL,

  "mapping_id" VARCHAR(255) NOT NULL,
  "mapping_version_at_import" INTEGER NOT NULL,
  "mapping_version_at_last_sync" INTEGER NOT NULL,

  "external_revision" VARCHAR(255),
  "status" "ExternalReservationLinkStatus" NOT NULL,
  "conflict_reason" VARCHAR(500),

  "imported_at" TIMESTAMPTZ NOT NULL,
  "last_synced_at" TIMESTAMPTZ,
  "last_external_update_at" VARCHAR(255),
  "archived_at" TIMESTAMPTZ,

  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "external_reservation_links_pkey" PRIMARY KEY ("tenant_id","id")
);

-- Idempotency / duplicate prevention key
CREATE UNIQUE INDEX "external_reservation_links_tenant_id_connection_id_external_reservation_id_key" ON "external_reservation_links"("tenant_id","connection_id","external_reservation_id");

-- CreateIndex
CREATE INDEX "external_reservation_links_tenant_id_booking_id_idx" ON "external_reservation_links"("tenant_id","booking_id");

-- CreateIndex
CREATE INDEX "external_reservation_links_tenant_id_connection_id_idx" ON "external_reservation_links"("tenant_id","connection_id");

-- AddForeignKey (ON DELETE RESTRICT, never cascade)
ALTER TABLE "external_reservation_links"
  ADD CONSTRAINT "external_reservation_links_tenant_id_mapping_id_fkey"
  FOREIGN KEY ("tenant_id","mapping_id")
  REFERENCES "channel_listing_mappings"("tenant_id","id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Row Level Security (ADR-002 defense in depth)
ALTER TABLE "channel_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "channel_listing_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "external_reservation_links" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_channel_connections ON "channel_connections"
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE POLICY tenant_isolation_channel_listing_mappings ON "channel_listing_mappings"
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE POLICY tenant_isolation_external_reservation_links ON "external_reservation_links"
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

