-- F3.1: Dedicated Talos application runtime role (non-BYPASSRLS).
-- Password / LOGIN are configured out-of-band by authorized provisioning
-- (never commit credentials). This migration only creates the role shape + grants.
--
-- Note: On Supabase, ALTER ROLE of attribute flags can be blocked by hooks.
-- CREATE ROLE sets the required attributes; do not re-ALTER them here.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'talos_runtime') THEN
    CREATE ROLE talos_runtime
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS
      NOREPLICATION
      NOLOGIN;
  END IF;
END $$;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO talos_runtime',
    current_database()
  );
END $$;

GRANT USAGE ON SCHEMA public TO talos_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO talos_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO talos_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO talos_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO talos_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO talos_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO talos_runtime;

-- Invariant: talos_runtime must NOT create/drop/alter tables,
-- alter/disable RLS policies, create roles, or run prisma migrate.
