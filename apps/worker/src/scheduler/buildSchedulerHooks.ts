/**
 * Build enabled scheduler hooks from worker config + DI ports.
 */

import type { EnqueueJobUseCase, ScheduleIcalPollsUseCase } from "@hcp/domain";
import type { WorkerSchedulerConfig } from "../config";
import { createIcalPollSchedulerHook } from "./icalPollScheduler";
import { createHoldExpirySchedulerHook } from "./holdExpiryScheduler";
import { createProviderRetrievalSchedulerHook } from "./providerRetrievalHook";
import type {
  ProviderRetrievalSchedulerPort,
  SchedulerHookDefinition,
} from "./types";

export type SchedulerDependencies = {
  scheduleIcalPollsUseCase: Pick<ScheduleIcalPollsUseCase, "execute">;
  enqueueJobUseCase: Pick<EnqueueJobUseCase, "execute">;
  /** Future OTA retrieval ports — empty until a provider is wired. */
  providerRetrievalPorts?: ProviderRetrievalSchedulerPort[];
};

export function buildSchedulerHooks(
  config: WorkerSchedulerConfig,
  deps: SchedulerDependencies,
): SchedulerHookDefinition[] {
  const hooks: SchedulerHookDefinition[] = [
    createIcalPollSchedulerHook({
      enabled: config.icalSchedulerEnabled,
      intervalMs: config.icalSchedulerIntervalMs,
      scheduleIcalPolls: deps.scheduleIcalPollsUseCase,
    }),
    createHoldExpirySchedulerHook({
      enabled: config.holdExpirySchedulerEnabled,
      intervalMs: config.holdExpirySchedulerIntervalMs,
      enqueueJob: deps.enqueueJobUseCase,
      limit: config.holdExpiryJobLimit,
    }),
  ];

  for (const port of deps.providerRetrievalPorts ?? []) {
    hooks.push(
      createProviderRetrievalSchedulerHook(port, {
        enabled: config.providerRetrievalSchedulerEnabled,
        intervalMs: config.providerRetrievalSchedulerIntervalMs,
      }),
    );
  }

  return hooks;
}
