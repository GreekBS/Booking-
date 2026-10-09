-- RLS policies for tenant isolation (defense in depth)
-- Run after Prisma migrations
-- Note: Production migrations apply ENABLE/FORCE RLS + WITH CHECK per table.
-- This file is a living reference for core + website-builder isolation shape.

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_properties ON properties
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE POLICY tenant_isolation_units ON units
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE POLICY tenant_isolation_memberships ON memberships
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

CREATE POLICY tenant_isolation_invitations ON invitations
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
  );

-- Website Builder A1 (authoritative DDL lives in
-- prisma/migrations/20261009120000_website_builder_a1_foundation/migration.sql)
ALTER TABLE websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_websites ON websites
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_website_versions ON website_versions
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY tenant_isolation_website_media_assets ON website_media_assets
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
