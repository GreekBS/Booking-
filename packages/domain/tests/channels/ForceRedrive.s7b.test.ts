import { describe, expect, it } from "vitest";
import { ForceRedrivePendingIcalInventoryReconcileUseCase } from "../../src/channels/application/ForceRedrivePendingIcalInventoryReconcileUseCase";
import {
  buildIcalInventoryReconcilePrimaryJobKey,
  buildIcalInventoryReconcileSuccessorJobKey,
} from "../../src/channels/providers/ical/inventory/icalInventoryReconcileJobIdentity";
import { RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE } from "../../src/platform/async/jobs/types/JobTypes";
import { EnqueueJobUseCase } from "../../src/platform/async/jobs/application/EnqueueJobUseCase";
import type {
  BackgroundJobEntry,
  EnqueueJobCommand,
  IJobScheduler,
} from "../../src/shared/types/index";
import { ConflictError } from "../../src/shared/errors/DomainError";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import type { IAuditLogRepository } from "../../src/shared/ports/InfrastructurePorts";
import type { ActorContext } from "../../src/shared/services/PermissionChecker";
import type { UseCaseAuditContext } from "../../src/shared/types/AuditContext";

const TENANT = "550e8400-e29b-41d4-a716-446655440801";
const CONNECTION = "conn-s7b-fr";
const MAPPING = "map-s7b-fr";

const permissions = new PermissionChecker();
const noopAuditLog: IAuditLogRepository = { append: async () => {} };
const operatorActor: ActorContext = {
  userId: "op-1",
  role: "admin",
  propertyIds: null,
  isSuperAdmin: true,
};
const operatorAudit: UseCaseAuditContext = { actorId: "op-1", ipAddress: null };

class FakeJobScheduler implements IJobScheduler {
  readonly jobs: BackgroundJobEntry[] = [];
  private seq = 0;

  async schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry> {
    if (command.idempotencyKey) {
      const existing = this.jobs.find(
        (j) => j.jobType === command.jobType && j.idempotencyKey === command.idempotencyKey,
      );
      if (existing) return existing;
    }
    this.seq += 1;
    const job: BackgroundJobEntry = {
      id: `job-${this.seq}`,
      tenantId: command.tenantId ?? null,
      jobType: command.jobType,
      payload: command.payload,
      status: "pending",
      priority: command.priority ?? 0,
      runAt: command.runAt ?? new Date(),
      idempotencyKey: command.idempotencyKey ?? null,
      attemptCount: 0,
      maxAttempts: command.maxAttempts ?? 5,
      createdAt: new Date(Date.now() + this.seq),
    };
    this.jobs.push(job);
    return job;
  }

  async cancel(): Promise<void> {}
}

describe("P1-S7b ForceRedrivePendingIcalInventoryReconcileUseCase", () => {
  it("pending + dead_letter → successor; successor pending → idempotent", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const scheduler = new FakeJobScheduler();
      const enqueue = new EnqueueJobUseCase(scheduler);
      const pred = await enqueue.execute({
        tenantId: TENANT,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey: buildIcalInventoryReconcilePrimaryJobKey({
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        }),
        payload: { connectionId: CONNECTION, cursorVersion: 1 },
      });
      const predJob = pred.getValue();
      predJob.status = "dead_letter";

      let jobsForGeneration: BackgroundJobEntry[] = [predJob];
      const force = new ForceRedrivePendingIcalInventoryReconcileUseCase(
        {
          listJobsForGeneration: async () => jobsForGeneration,
        },
        enqueue,
        async () => ({
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
          semanticConfigVersion: 2,
          mappingId: MAPPING,
          mappingVersion: 1,
        }),
        {
          findStatus: async () => "active",
          findRedriveGate: async () => ({
            status: "active",
            inventoryApplyEnabled: true,
          }),
        },
        permissions,
        noopAuditLog,
      );

      const first = await force.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        },
        operatorActor,
        operatorAudit,
      );
      expect(first.isSuccess).toBe(true);
      expect(first.getValue().previousJobStatus).toBe("dead_letter");

      const successor = scheduler.jobs.find((j) => j.id === first.getValue().jobId)!;
      jobsForGeneration = [successor, predJob];

      const second = await force.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        },
        operatorActor,
        operatorAudit,
      );
      expect(second.isSuccess).toBe(true);
      expect(second.getValue().jobId).toBe(first.getValue().jobId);
      expect(second.getValue().idempotencyKey).toBe(
        buildIcalInventoryReconcileSuccessorJobKey(
          { tenantId: TENANT, connectionId: CONNECTION, cursorVersion: 1 },
          predJob.id,
        ),
      );
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });

  it("cancelled predecessor → successor", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const scheduler = new FakeJobScheduler();
      const enqueue = new EnqueueJobUseCase(scheduler);
      const pred = await enqueue.execute({
        tenantId: TENANT,
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        idempotencyKey: buildIcalInventoryReconcilePrimaryJobKey({
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 2,
        }),
        payload: { connectionId: CONNECTION, cursorVersion: 2 },
      });
      pred.getValue().status = "cancelled";

      const force = new ForceRedrivePendingIcalInventoryReconcileUseCase(
        { listJobsForGeneration: async () => [pred.getValue()] },
        enqueue,
        async () => ({
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 2,
          semanticConfigVersion: 2,
          mappingId: MAPPING,
          mappingVersion: 1,
        }),
        {
          findStatus: async () => "active",
          findRedriveGate: async () => ({
            status: "active",
            inventoryApplyEnabled: true,
          }),
        },
        permissions,
        noopAuditLog,
      );

      const result = await force.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 2,
        },
        operatorActor,
        operatorAudit,
      );
      expect(result.isSuccess).toBe(true);
      expect(result.getValue().previousJobStatus).toBe("cancelled");
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });

  it("paused connection → fail closed", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const force = new ForceRedrivePendingIcalInventoryReconcileUseCase(
        { listJobsForGeneration: async () => [] },
        new EnqueueJobUseCase(new FakeJobScheduler()),
        async () => ({
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
          semanticConfigVersion: 2,
          mappingId: MAPPING,
          mappingVersion: 1,
        }),
        {
          findStatus: async () => "paused",
          findRedriveGate: async () => ({
            status: "paused",
            inventoryApplyEnabled: true,
          }),
        },
        permissions,
        noopAuditLog,
      );
      const result = await force.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        },
        operatorActor,
        operatorAudit,
      );
      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ConflictError);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });

  it("missing pending generation (applied/superseded/failed) → reject", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const force = new ForceRedrivePendingIcalInventoryReconcileUseCase(
        { listJobsForGeneration: async () => [] },
        new EnqueueJobUseCase(new FakeJobScheduler()),
        async () => null,
        {
          findStatus: async () => "active",
          findRedriveGate: async () => ({
            status: "active",
            inventoryApplyEnabled: true,
          }),
        },
        permissions,
        noopAuditLog,
      );
      const result = await force.execute(
        {
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        },
        operatorActor,
        operatorAudit,
      );
      expect(result.isFailure).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });
});
