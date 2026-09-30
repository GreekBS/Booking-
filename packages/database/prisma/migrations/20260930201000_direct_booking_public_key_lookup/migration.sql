-- Public Direct Booking key lookup under FORCE RLS.
-- Opaque public_key_hash is the only selector; function is SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.lookup_direct_booking_integration_by_key_hash(p_hash text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  property_id uuid,
  unit_id uuid,
  environment "PublishableKeyEnvironment",
  allowed_origins text[],
  status "DirectBookingIntegrationStatus"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id,
    i.tenant_id,
    i.property_id,
    i.unit_id,
    i.environment,
    i.allowed_origins,
    i.status
  FROM public.direct_booking_integrations i
  WHERE i.public_key_hash = p_hash
    AND i.status <> 'disabled'::"DirectBookingIntegrationStatus"
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_direct_booking_integration_by_key_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_direct_booking_integration_by_key_hash(text) TO PUBLIC;
