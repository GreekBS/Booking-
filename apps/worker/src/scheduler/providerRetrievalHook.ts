/**
 * Future provider retrieval scheduler extension point.
 *
 * Conceptual flow (NOT implemented for Booking.com yet):
 *   provider retrieval scheduler
 *   → provider-specific retrieval use case
 *   → ReceiveChannelEventUseCase
 *   → Inbox
 *   → durable process_channel_inbox job
 *   → worker drain
 *   → Commerce
 *
 * Must NEVER write Booking / Hold / inventory / Channel Inbox directly.
 */

import type {
  ProviderRetrievalSchedulerPort,
  SchedulerHookDefinition,
} from "./types";

export const PROVIDER_RETRIEVAL_SCHEDULER_HOOK_PREFIX =
  "provider_retrieval_scheduler";

export function providerRetrievalHookName(providerId: string): string {
  return `${PROVIDER_RETRIEVAL_SCHEDULER_HOOK_PREFIX}:${providerId}`;
}

/**
 * Wrap a provider retrieval port as a scheduler hook.
 * Callers must supply a port that only performs ingress via ReceiveChannelEventUseCase.
 */
export function createProviderRetrievalSchedulerHook(
  port: ProviderRetrievalSchedulerPort,
  options: { enabled: boolean; intervalMs: number },
): SchedulerHookDefinition {
  return {
    name: providerRetrievalHookName(port.providerId),
    enabled: options.enabled,
    intervalMs: options.intervalMs,
    run: async (ctx) => {
      if (ctx.signal.aborted) return;
      return port.retrieveAndIngress(ctx);
    },
  };
}

/**
 * Forbidden patterns for provider-retrieval scheduler modules (architecture fitness).
 * Kept as data for tests — do not import Commerce persistence into scheduler code.
 */
export const PROVIDER_RETRIEVAL_SCHEDULER_FORBIDDEN_IMPORT_PATTERNS: RegExp[] = [
  /IBookingRepository/,
  /IHoldRepository/,
  /ICalendarBlockRepository/,
  /CreateBookingUseCase/,
  /CreateHoldUseCase/,
  /PrismaBookingRepository/,
  /PrismaHoldRepository/,
  /IChannelInboxRepository/,
  /channelInboxRepository\.create/,
  /outboxEvent\.create/,
];
