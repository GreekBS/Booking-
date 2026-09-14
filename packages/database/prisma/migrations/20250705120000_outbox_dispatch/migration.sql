-- Outbox dispatcher: claim, retry, and dead-letter support
CREATE TYPE "OutboxEventStatus" AS ENUM ('pending', 'processing', 'completed', 'dead_letter');

ALTER TABLE "outbox_events"
  ADD COLUMN "status" "OutboxEventStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error" TEXT,
  ADD COLUMN "claimed_at" TIMESTAMPTZ;

UPDATE "outbox_events"
SET "status" = 'completed'
WHERE "processed_at" IS NOT NULL;

CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");
