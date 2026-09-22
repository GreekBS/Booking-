/**
 * Worker scheduler hook contract.
 *
 * SCHEDULED path: timer → durable enqueue (use cases) → NOTIFY wake → worker drain.
 * Hooks must never write Booking / Hold / inventory / Inbox directly.
 */

export type SchedulerTickContext = {
  signal: AbortSignal;
  now: () => Date;
};

/** Sparse result for restrained logging — omit when nothing meaningful happened. */
export type SchedulerTickResult = {
  examined?: number;
  enqueued?: number;
  skipped?: number;
  reused?: number;
  /** Free-form safe counters (no secrets). */
  details?: Record<string, number | boolean | string | undefined>;
};

export type SchedulerHookDefinition = {
  /** Stable hook name for logs / overlap lock. */
  name: string;
  enabled: boolean;
  /** Independent cadence in ms. */
  intervalMs: number;
  /**
   * Discovery / enqueue only. Must call existing application use cases.
   * Must not perform provider business I/O that mutates inventory/Booking directly.
   */
  run: (ctx: SchedulerTickContext) => Promise<SchedulerTickResult | void>;
};

/**
 * Future OTA retrieval schedulers plug in here.
 * Implementations must route through ReceiveChannelEventUseCase (Channel ingress).
 */
export type ProviderRetrievalSchedulerPort = {
  readonly providerId: string;
  /**
   * Provider-specific retrieval that ends at Channel ingress — never Commerce writes.
   */
  retrieveAndIngress: (ctx: SchedulerTickContext) => Promise<SchedulerTickResult | void>;
};
