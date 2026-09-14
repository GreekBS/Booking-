-- P1-S7c Phase 1: connection-scoped inventory apply fence (default OFF).
ALTER TABLE "channel_connections"
ADD COLUMN "inventory_apply_enabled" BOOLEAN NOT NULL DEFAULT false;
