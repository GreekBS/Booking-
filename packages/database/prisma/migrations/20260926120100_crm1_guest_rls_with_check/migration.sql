-- CRM-1 hardening: explicit WITH CHECK on guests tenant isolation (matches F3.1 intent).
DROP POLICY IF EXISTS tenant_isolation_guests ON guests;

CREATE POLICY tenant_isolation_guests ON guests
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
