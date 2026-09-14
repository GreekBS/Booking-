-- Background jobs foundation
CREATE TYPE "BackgroundJobStatus" AS ENUM ('pending', 'processing', 'completed', 'dead_letter', 'cancelled');

CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "job_type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'pending',
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" VARCHAR(255),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "last_error" TEXT,
    "claimed_at" TIMESTAMPTZ,
    "next_retry_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "background_jobs_job_type_idempotency_key_key"
  ON "background_jobs"("job_type", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX "background_jobs_claim_idx"
  ON "background_jobs"("status", "run_at", "next_retry_at", "priority" DESC, "created_at");

CREATE INDEX "background_jobs_tenant_status_created_at_idx"
  ON "background_jobs"("tenant_id", "status", "created_at");

CREATE INDEX "background_jobs_status_completed_at_idx"
  ON "background_jobs"("status", "completed_at");
