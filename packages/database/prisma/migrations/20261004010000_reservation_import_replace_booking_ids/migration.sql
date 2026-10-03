-- Phase B2: multi-booking replace targets for CSV reservation import keep_csv decisions.
ALTER TABLE "reservation_import_rows"
  ADD COLUMN "replace_booking_ids" JSONB NOT NULL DEFAULT '[]';
