-- P1-S7a: durable observed/cancelled identity evidence for authoritative soft-removal.
-- Additive only. Legacy rows keep complete_observed_evidence=false (fail closed).

ALTER TABLE "channel_inventory_reconciliations"
  ADD COLUMN "complete_observed_evidence" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "observed_source_identity_keys" JSONB,
  ADD COLUMN "cancelled_source_identity_keys" JSONB;
