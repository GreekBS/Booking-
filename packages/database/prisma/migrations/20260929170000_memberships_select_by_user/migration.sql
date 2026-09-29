-- Allow authenticated reads of a user's own memberships without tenant GUC.
-- Required for GetMe / self-serve onboarding under FORCE RLS + non-BYPASSRLS role.
-- Tenant-scoped ALL policy remains the write/isolation authority.

CREATE POLICY memberships_select_by_user ON memberships
  FOR SELECT
  USING (
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
