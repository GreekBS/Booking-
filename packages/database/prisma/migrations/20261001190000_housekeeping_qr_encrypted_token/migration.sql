-- Recoverable encrypted QR token material for authorized display/reprint.
-- SHA-256 token_hash remains the scan/resolve authority.
-- Additive + nullable: existing ACTIVE rows stay valid (unrecoverable until rotate).
-- Does NOT backfill or rotate existing Production QR rows.

ALTER TABLE "cleaning_location_qr_access"
  ADD COLUMN "token_ciphertext" BYTEA,
  ADD COLUMN "token_key_version" INT;

ALTER TABLE "unit_qr_access"
  ADD COLUMN "token_ciphertext" BYTEA,
  ADD COLUMN "token_key_version" INT;
