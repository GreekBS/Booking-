-- Active Property 1.2: operator workspace affinity for unmapped ChannelConnections.
-- NOT exclusive ownership — multi-property mappings remain valid.
-- Existing rows stay NULL (unassigned); do not guess property ownership.

ALTER TABLE "channel_connections"
  ADD COLUMN "workspace_property_id" UUID;

CREATE INDEX "channel_connections_tenant_id_workspace_property_id_idx"
  ON "channel_connections"("tenant_id", "workspace_property_id");

ALTER TABLE "channel_connections"
  ADD CONSTRAINT "channel_connections_workspace_property_fkey"
  FOREIGN KEY ("workspace_property_id") REFERENCES "properties"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
