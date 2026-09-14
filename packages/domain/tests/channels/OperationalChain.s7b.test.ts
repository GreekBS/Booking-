import { describe, expect, it } from "vitest";
import { EnqueueJobUseCase } from "../../src/platform/async/jobs/application/EnqueueJobUseCase";
import { IcalInventoryReconcileOutboxHandler } from "../../src/channels/application/IcalInventoryReconcileOutboxHandler";
import { SweepPendingIcalInventoryReconcileUseCase } from "../../src/channels/application/SweepPendingIcalInventoryReconcileUseCase";
import { ScheduleIcalPollsUseCase } from "../../src/channels/application/ScheduleIcalPollsUseCase";
import { EnqueueChannelConnectionPollUseCase } from "../../src/channels/application/EnqueueChannelConnectionPollUseCase";
import { ChannelConnection } from "../../src/channels/domain/ChannelConnection";
import { CredentialReference } from "../../src/channels/domain/value-objects/CredentialReference";
import { InMemoryChannelConnectionRepository } from "../../src/channels/repositories/InMemoryChannelConnectionRepository";
import { InMemoryChannelPollJobQuery } from "../../src/channels/repositories/InMemoryChannelPollJobQuery";
import { ChannelProviderRegistry } from "../../src/channels/providers/ChannelProviderRegistry";
import { withDefaultProviderRegistrationPolicies } from "../../src/channels/ports/providers/ChannelProviderRegistration";
import { ICAL_PROVIDER_CAPABILITIES } from "../../src/channels/types/ChannelCapabilities";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import { ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE } from "../../src/channels/providers/ical/inventory/icalInventoryReconcileOutboxIdentity";
import {
  POLL_CHANNEL_CONNECTION_JOB_TYPE,
  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
  SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE,
} from "../../src/platform/async/jobs/types/JobTypes";
import type {
  BackgroundJobEntry,
  EnqueueJobCommand,
  IJobScheduler,
  OutboxEntry,
} from "../../src/shared/types/index";
import { buildIcalInventoryReconcilePrimaryJobKey } from "../../src/channels/providers/ical/inventory/icalInventoryReconcileJobIdentity";

const TENANT = "tenant-chain";
const CONNECTION = "conn-chain";
const MAPPING = "map-chain";

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

/**
 * Focused composition proof: schedule → poll job → (simulated TX1 outbox) →
 * outbox handler → reconcile job. Sweep does not auto-redrive dead_letter.
 * Does not require production cron.
 */
describe("P1-S7b operational chain composition", () => {
  it("schedule → poll job; outbox → reconcile job; sweep skips dead_letter", async () => {
    const previous = process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
    process.env.CHANNELS_INVENTORY_APPLY_ENABLED = "true";
    try {
      const connections = new InMemoryChannelConnectionRepository();
      const scheduler = new FakeJobScheduler();
      const enqueue = new EnqueueJobUseCase(scheduler);
      const pollQuery = new InMemoryChannelPollJobQuery(() => scheduler.jobs);
      const registry = new ChannelProviderRegistry();
      registry.register(
        withDefaultProviderRegistrationPolicies({
          providerId: "ical",
          status: "active",
          capabilities: ICAL_PROVIDER_CAPABILITIES,
          auth: null,
          webhooks: null,
          polling: { poll: async () => ({}) } as never,
          reservationImport: null,
          availabilityExport: null,
          rateRestrictionExport: null,
          reservationExport: null,
        }),
      );

      const connection = ChannelConnection.createDraft({
        id: CONNECTION,
        tenantId: TENANT,
        provider: "ical",
        displayName: "Chain",
      });
      connection.attachCredentials(CredentialReference.create("cred_chain"));
      connection.activate();
      await connections.create(connection);
      connection.applySemanticModeChange("availability_block_feed");
      await connections.persistSemanticState({
        tenantId: TENANT,
        connectionId: CONNECTION,
        expectedSemanticConfigVersion: 1,
        semanticMode: connection.semanticMode,
        semanticConfigVersion: connection.semanticConfigVersion,
        updatedAt: connection.updatedAt,
      });
      await connections.setInventoryApplyEnabledForTests(TENANT, CONNECTION, true);

      const enqueuePoll = new EnqueueChannelConnectionPollUseCase(
        connections,
        registry,
        enqueue,
        new PermissionChecker(),
        pollQuery,
      );

      const now = new Date("2026-09-14T12:00:00.000Z");
      const schedule = new ScheduleIcalPollsUseCase(
        { listEligible: async () => [{ tenantId: TENANT, connectionId: CONNECTION }] },
        pollQuery,
        enqueuePoll,
        enqueue,
        registry,
        () => true,
      );
      const scheduled = await schedule.execute({ now, random: () => 0 });
      expect(scheduled.isSuccess).toBe(true);
      expect(scheduled.getValue().enqueuedPolls).toBe(1);
      expect(
        scheduler.jobs.some((j) => j.jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE),
      ).toBe(true);
      expect(
        scheduler.jobs.some(
          (j) => j.jobType === SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE,
        ),
      ).toBe(true);

      // Simulate TX1 outbox → reconcile enqueue (jobs/run + outbox/dispatch composition)
      const outbox: OutboxEntry = {
        id: "ob-1",
        tenantId: TENANT,
        aggregateType: "ChannelInventoryReconciliation",
        aggregateId: CONNECTION,
        eventType: ICAL_INVENTORY_RECONCILE_OUTBOX_EVENT_TYPE,
        payload: {
          connectionId: CONNECTION,
          cursorVersion: 1,
          semanticConfigVersion: 1,
          mappingId: MAPPING,
          mappingVersion: 1,
        },
        status: "pending",
        attemptCount: 0,
      };
      const handler = new IcalInventoryReconcileOutboxHandler(enqueue);
      await handler.handle(outbox);
      const reconcileJobs = scheduler.jobs.filter(
        (j) => j.jobType === RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
      );
      expect(reconcileJobs).toHaveLength(1);
      expect(reconcileJobs[0]!.idempotencyKey).toBe(
        buildIcalInventoryReconcilePrimaryJobKey({
          tenantId: TENANT,
          connectionId: CONNECTION,
          cursorVersion: 1,
        }),
      );

      // Sweep must not auto-redrive dead_letter/cancelled
      reconcileJobs[0]!.status = "dead_letter";
      const sweep = new SweepPendingIcalInventoryReconcileUseCase(
        {
          listPending: async () => [
            {
              tenantId: TENANT,
              connectionId: CONNECTION,
              cursorVersion: 1,
              semanticConfigVersion: 1,
              mappingId: MAPPING,
              mappingVersion: 1,
            },
          ],
        },
        {
          listJobsForGeneration: async () => reconcileJobs,
        },
        enqueue,
        {
          findStatus: async () => "active",
          findRedriveGate: async () => ({
            status: "active",
            inventoryApplyEnabled: true,
          }),
        },
      );
      const swept = await sweep.execute();
      expect(swept.isSuccess).toBe(true);
      expect(swept.getValue().stuckDeadLetter).toBe(1);
      expect(swept.getValue().enqueuedSuccessor).toBe(0);
      expect(
        scheduler.jobs.filter((j) => j.jobType === RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE),
      ).toHaveLength(1);
    } finally {
      if (previous === undefined) delete process.env.CHANNELS_INVENTORY_APPLY_ENABLED;
      else process.env.CHANNELS_INVENTORY_APPLY_ENABLED = previous;
    }
  });
});
