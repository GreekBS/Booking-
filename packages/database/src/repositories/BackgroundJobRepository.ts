import type {
  BackgroundJobEntry,
  BackgroundJobStatus,
  ClaimJobBatchFilter,
  EnqueueJobCommand,
  IBackgroundJobRepository,
  IJobScheduler,
  JobFailureDisposition,
} from "@hcp/domain";
import { computeNextRetryAt } from "@hcp/domain";
import type { Prisma } from "@prisma/client";
import { prisma } from "../client";
import {
  TALOS_ASYNC_WAKE_JOBS_CHANNEL,
  notifyTalosAsyncWake,
} from "../async/talosAsyncWake";

const STALE_CLAIM_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;

type ClaimedJobRow = {
  id: string;
  tenant_id: string | null;
  job_type: string;
  payload: unknown;
  status: BackgroundJobStatus;
  priority: number;
  run_at: Date;
  idempotency_key: string | null;
  attempt_count: number;
  max_attempts: number;
  created_at: Date;
};

function mapJobRow(row: ClaimedJobRow): BackgroundJobEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobType: row.job_type,
    payload: row.payload as Record<string, unknown>,
    status: row.status,
    priority: row.priority,
    runAt: row.run_at,
    idempotencyKey: row.idempotency_key,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    createdAt: row.created_at,
  };
}

function mapPrismaJob(record: {
  id: string;
  tenantId: string | null;
  jobType: string;
  payload: unknown;
  status: BackgroundJobStatus;
  priority: number;
  runAt: Date;
  idempotencyKey: string | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
}): BackgroundJobEntry {
  return {
    id: record.id,
    tenantId: record.tenantId,
    jobType: record.jobType,
    payload: record.payload as Record<string, unknown>,
    status: record.status,
    priority: record.priority,
    runAt: record.runAt,
    idempotencyKey: record.idempotencyKey,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    createdAt: record.createdAt,
  };
}

export class PrismaBackgroundJobRepository implements IBackgroundJobRepository {
  async enqueue(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    if (command.idempotencyKey) {
      const existing = await prisma.backgroundJob.findFirst({
        where: {
          jobType: command.jobType,
          idempotencyKey: command.idempotencyKey,
        },
      });
      if (existing) {
        // Pending work may predate a connected worker — best-effort wake.
        if (existing.status === "pending") {
          await notifyTalosAsyncWake(prisma, TALOS_ASYNC_WAKE_JOBS_CHANNEL);
        }
        return mapPrismaJob(existing);
      }
    }

    try {
      // Durable create + transactional NOTIFY (delivered only after commit).
      const record = await prisma.$transaction(async (tx) => {
        const created = await tx.backgroundJob.create({
          data: {
            tenantId: command.tenantId ?? null,
            jobType: command.jobType,
            payload: command.payload as Prisma.InputJsonValue,
            status: "pending",
            priority: command.priority ?? 0,
            runAt: command.runAt ?? new Date(),
            idempotencyKey: command.idempotencyKey ?? null,
            maxAttempts: command.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          },
        });
        await notifyTalosAsyncWake(tx, TALOS_ASYNC_WAKE_JOBS_CHANNEL);
        return created;
      });
      return mapPrismaJob(record);
    } catch (error) {
      // Race-safe convergence for concurrent creates with the same (job_type, idempotency_key).
      if (
        command.idempotencyKey &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        const raced = await prisma.backgroundJob.findFirst({
          where: {
            jobType: command.jobType,
            idempotencyKey: command.idempotencyKey,
          },
        });
        if (raced) {
          if (raced.status === "pending") {
            await notifyTalosAsyncWake(prisma, TALOS_ASYNC_WAKE_JOBS_CHANNEL);
          }
          return mapPrismaJob(raced);
        }
      }
      throw error;
    }
  }

  async findById(id: string): Promise<BackgroundJobEntry | null> {
    const record = await prisma.backgroundJob.findUnique({ where: { id } });
    return record ? mapPrismaJob(record) : null;
  }

  async claimBatch(limit: number, filter?: ClaimJobBatchFilter): Promise<BackgroundJobEntry[]> {
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
    const jobTypes = filter?.jobTypes?.filter(Boolean) ?? [];

    if (jobTypes.length === 0) {
      const rows = await prisma.$queryRaw<ClaimedJobRow[]>`
        UPDATE "background_jobs"
        SET
          "status" = 'processing'::"BackgroundJobStatus",
          "claimed_at" = NOW(),
          "started_at" = COALESCE("started_at", NOW())
        WHERE "id" IN (
          SELECT "id"
          FROM "background_jobs"
          WHERE
            "status" IN ('pending'::"BackgroundJobStatus", 'processing'::"BackgroundJobStatus")
            AND "run_at" <= NOW()
            AND ("next_retry_at" IS NULL OR "next_retry_at" <= NOW())
            AND (
              "status" = 'pending'::"BackgroundJobStatus"
              OR "claimed_at" < ${staleBefore}
            )
          ORDER BY "priority" DESC, "run_at" ASC, "created_at" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING
          "id",
          "tenant_id",
          "job_type",
          "payload",
          "status",
          "priority",
          "run_at",
          "idempotency_key",
          "attempt_count",
          "max_attempts",
          "created_at"
      `;
      return rows.map(mapJobRow);
    }

    const rows = await prisma.$queryRaw<ClaimedJobRow[]>`
      UPDATE "background_jobs"
      SET
        "status" = 'processing'::"BackgroundJobStatus",
        "claimed_at" = NOW(),
        "started_at" = COALESCE("started_at", NOW())
      WHERE "id" IN (
        SELECT "id"
        FROM "background_jobs"
        WHERE
          "status" IN ('pending'::"BackgroundJobStatus", 'processing'::"BackgroundJobStatus")
          AND "run_at" <= NOW()
          AND ("next_retry_at" IS NULL OR "next_retry_at" <= NOW())
          AND "job_type" = ANY(${jobTypes}::varchar[])
          AND (
            "status" = 'pending'::"BackgroundJobStatus"
            OR "claimed_at" < ${staleBefore}
          )
        ORDER BY "priority" DESC, "run_at" ASC, "created_at" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        "id",
        "tenant_id",
        "job_type",
        "payload",
        "status",
        "priority",
        "run_at",
        "idempotency_key",
        "attempt_count",
        "max_attempts",
        "created_at"
    `;
    return rows.map(mapJobRow);
  }

  async markCompleted(id: string): Promise<void> {
    await prisma.backgroundJob.update({
      where: { id },
      data: {
        status: "completed",
        completedAt: new Date(),
        claimedAt: null,
        nextRetryAt: null,
      },
    });
  }

  async markFailed(id: string, error: string): Promise<JobFailureDisposition> {
    const record = await prisma.backgroundJob.findUnique({ where: { id } });
    if (!record) {
      throw new Error(`Background job not found: ${id}`);
    }

    const attemptCount = record.attemptCount + 1;
    if (attemptCount >= record.maxAttempts) {
      await prisma.backgroundJob.update({
        where: { id },
        data: {
          status: "dead_letter",
          attemptCount,
          lastError: error,
          claimedAt: null,
        },
      });
      return "dead_letter";
    }

    await prisma.$transaction(async (tx) => {
      await tx.backgroundJob.update({
        where: { id },
        data: {
          status: "pending",
          attemptCount,
          lastError: error,
          claimedAt: null,
          nextRetryAt: computeNextRetryAt(attemptCount),
        },
      });
      await notifyTalosAsyncWake(tx, TALOS_ASYNC_WAKE_JOBS_CHANNEL);
    });
    return "retry";
  }

  async cancel(id: string): Promise<void> {
    const record = await prisma.backgroundJob.findUnique({ where: { id } });
    if (!record) {
      throw new Error(`Background job not found: ${id}`);
    }
    if (record.status !== "pending") {
      throw new Error(`Only pending jobs can be cancelled: ${id}`);
    }

    await prisma.backgroundJob.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
    });
  }
}

export class PrismaJobScheduler implements IJobScheduler {
  constructor(private readonly jobRepository: PrismaBackgroundJobRepository) {}

  schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    return this.jobRepository.enqueue(command);
  }

  cancel(jobId: string): Promise<void> {
    return this.jobRepository.cancel(jobId);
  }
}
