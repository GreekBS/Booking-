-- RLS policies for tenant isolation (defense in depth)
-- Run after Prisma migrations

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
