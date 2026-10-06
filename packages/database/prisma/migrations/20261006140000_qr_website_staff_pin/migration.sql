-- QR → Website / Staff PIN housekeeping (ADR-030 amendment 2026-10-06).
-- Additive only. Local hcp_test first — never apply to Production from agent.

-- ---------------------------------------------------------------------------
-- Property website URL + staff PIN (bcrypt hash only)
-- ---------------------------------------------------------------------------
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "website_url" VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS "staff_pin_hash" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "staff_pin_failed_attempts" INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "staff_pin_locked_until" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "staff_pin_updated_at" TIMESTAMPTZ;

ALTER TABLE "properties"
  DROP CONSTRAINT IF EXISTS "properties_website_url_scheme_check";

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_website_url_scheme_check"
  CHECK (
    "website_url" IS NULL
    OR (
      char_length(trim("website_url")) > 0
      AND char_length("website_url") <= 2048
      AND (
        lower("website_url") LIKE 'https://%'
        OR lower("website_url") LIKE 'http://%'
      )
    )
  );

ALTER TABLE "properties"
  DROP CONSTRAINT IF EXISTS "properties_staff_pin_failed_attempts_nonneg";

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_staff_pin_failed_attempts_nonneg"
  CHECK ("staff_pin_failed_attempts" >= 0);

-- ---------------------------------------------------------------------------
-- Public ACTIVE QR hash lookup (SECURITY DEFINER) — token is unguessable.
-- Location QR preferred over legacy unit QR for the same hash.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_active_cleaning_qr_by_token_hash(
  p_token_hash char(64)
)
RETURNS TABLE (
  kind text,
  qr_access_id uuid,
  tenant_id uuid,
  property_id uuid,
  unit_id uuid,
  cleaning_location_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH location_hit AS (
    SELECT
      'location'::text AS kind,
      qr.id AS qr_access_id,
      qr.tenant_id,
      qr.property_id,
      loc.commercial_unit_id AS unit_id,
      qr.cleaning_location_id
    FROM cleaning_location_qr_access qr
    INNER JOIN cleaning_locations loc
      ON loc.id = qr.cleaning_location_id
     AND loc.tenant_id = qr.tenant_id
     AND loc.status = 'active'
    WHERE qr.token_hash = p_token_hash
      AND qr.status = 'ACTIVE'
    LIMIT 1
  ),
  unit_hit AS (
    SELECT
      'unit'::text AS kind,
      uq.id AS qr_access_id,
      uq.tenant_id,
      uq.property_id,
      uq.unit_id,
      loc.id AS cleaning_location_id
    FROM unit_qr_access uq
    LEFT JOIN cleaning_locations loc
      ON loc.tenant_id = uq.tenant_id
     AND loc.commercial_unit_id = uq.unit_id
     AND loc.status = 'active'
    WHERE uq.token_hash = p_token_hash
      AND uq.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM location_hit)
    LIMIT 1
  )
  SELECT * FROM location_hit
  UNION ALL
  SELECT * FROM unit_hit;
$$;

REVOKE ALL ON FUNCTION public.lookup_active_cleaning_qr_by_token_hash(char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_active_cleaning_qr_by_token_hash(char) TO talos_runtime;
