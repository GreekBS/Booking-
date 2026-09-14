-- Force RLS for table owner (Supabase postgres still bypasses as superuser)
ALTER TABLE properties FORCE ROW LEVEL SECURITY;
ALTER TABLE units FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
