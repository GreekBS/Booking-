-- C4: property-scoped CSV import + optional guest email (honest NULL).
-- Applied only against guarded local hcp_test during C4 implementation.

-- 1) Booking stay contact email may be absent
ALTER TABLE "bookings"
  ALTER COLUMN "guest_email" DROP NOT NULL;

-- 2) Import row email may be absent
ALTER TABLE "reservation_import_rows"
  ALTER COLUMN "guest_email" DROP NOT NULL;

-- 3) Durable property binding on import batches
ALTER TABLE "reservation_import_batches"
  ADD COLUMN "property_id" UUID;

-- Backfill from any accepted row's unit → property
UPDATE "reservation_import_batches" b
SET "property_id" = src."property_id"
FROM (
  SELECT DISTINCT ON (r."batch_id")
    r."batch_id",
    u."property_id"
  FROM "reservation_import_rows" r
  INNER JOIN "units" u ON u."id" = r."unit_id"
  ORDER BY r."batch_id", r."row_number" ASC
) src
WHERE b."id" = src."batch_id"
  AND b."property_id" IS NULL;

-- Drop leftover drafts that cannot be bound (no rows / orphan)
DELETE FROM "reservation_import_rejected_rows" rr
USING "reservation_import_batches" b
WHERE rr."batch_id" = b."id"
  AND b."property_id" IS NULL;

DELETE FROM "reservation_import_rows" r
USING "reservation_import_batches" b
WHERE r."batch_id" = b."id"
  AND b."property_id" IS NULL;

DELETE FROM "reservation_import_batches"
WHERE "property_id" IS NULL;

ALTER TABLE "reservation_import_batches"
  ALTER COLUMN "property_id" SET NOT NULL;

ALTER TABLE "reservation_import_batches"
  ADD CONSTRAINT "reservation_import_batches_property_id_fkey"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "reservation_import_batches_tenant_id_property_id_idx"
  ON "reservation_import_batches"("tenant_id", "property_id");

CREATE INDEX "reservation_import_batches_tenant_id_property_id_status_expires_at_idx"
  ON "reservation_import_batches"("tenant_id", "property_id", "status", "expires_at");
