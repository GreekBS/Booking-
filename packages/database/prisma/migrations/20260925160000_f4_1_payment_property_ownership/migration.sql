-- F4.1: Canonical Payment.property_id ownership (Active Property 1.1).
-- Existing payments (if any) are backfilled from Booking.property_id.
-- Rows without booking cannot be guessed — inspected at migrate time (Talos had 0).

ALTER TABLE "payments"
  ADD COLUMN "property_id" UUID;

-- Authoritative backfill from linked booking only.
UPDATE "payments" p
SET "property_id" = b."property_id"
FROM "bookings" b
WHERE p."booking_id" = b."id"
  AND p."property_id" IS NULL;

-- Fail closed if any payment remains without property ownership.
DO $$
DECLARE
  unresolved INTEGER;
BEGIN
  SELECT COUNT(*) INTO unresolved FROM "payments" WHERE "property_id" IS NULL;
  IF unresolved > 0 THEN
    RAISE EXCEPTION
      'F4.1 migration blocked: % payment(s) lack booking-derived property_id; refuse arbitrary assignment',
      unresolved;
  END IF;
END $$;

ALTER TABLE "payments"
  ALTER COLUMN "property_id" SET NOT NULL;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_property_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "payments_tenant_id_property_id_idx"
  ON "payments"("tenant_id", "property_id");

CREATE INDEX "payments_tenant_id_property_id_received_at_idx"
  ON "payments"("tenant_id", "property_id", "received_at");
