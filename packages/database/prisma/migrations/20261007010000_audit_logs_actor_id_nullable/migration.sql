-- Allow null actor_id for truthful system/capability audit actors (e.g. QR staff HK_STAFF).
-- Additive / non-destructive. Operator audits continue to set a User UUID.

ALTER TABLE "audit_logs"
  ALTER COLUMN "actor_id" DROP NOT NULL;
