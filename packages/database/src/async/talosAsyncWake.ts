/**
 * Best-effort async wake channels for Talos workers.
 *
 * DURABILITY: background_jobs / outbox_events remain authoritative.
 * NOTIFY is a wake optimization only — lost signals are recovered by the worker sweep.
 *
 * Transaction semantics:
 * - When issued on the same Prisma transaction client as the durable INSERT,
 *   PostgreSQL delivers NOTIFY only after that transaction commits.
 * - Failure to NOTIFY must never fail the business write (best-effort catch).
 * - Payloads are empty / non-sensitive; never encode secrets or business data.
 */

export const TALOS_ASYNC_WAKE_JOBS_CHANNEL = "talos_async_jobs" as const;
export const TALOS_ASYNC_WAKE_OUTBOX_CHANNEL = "talos_async_outbox" as const;

export type TalosAsyncWakeChannel =
  | typeof TALOS_ASYNC_WAKE_JOBS_CHANNEL
  | typeof TALOS_ASYNC_WAKE_OUTBOX_CHANNEL;

const ALLOWED_CHANNELS: ReadonlySet<string> = new Set([
  TALOS_ASYNC_WAKE_JOBS_CHANNEL,
  TALOS_ASYNC_WAKE_OUTBOX_CHANNEL,
]);

/** Minimal client surface (PrismaClient or TransactionClient). */
export type PgNotifyClient = {
  $executeRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
};

export function assertTalosAsyncWakeChannel(
  channel: string,
): asserts channel is TalosAsyncWakeChannel {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`Unknown Talos async wake channel: ${channel}`);
  }
}

/**
 * Best-effort pg_notify. Never throws to callers (swallows notify failures).
 * Empty payload by design.
 */
export async function notifyTalosAsyncWake(
  client: PgNotifyClient,
  channel: TalosAsyncWakeChannel,
): Promise<void> {
  assertTalosAsyncWakeChannel(channel);
  try {
    // Parameterized channel name + empty payload. PG delivers after TX commit
    // when `client` is the writing transaction.
    await client.$executeRaw`SELECT pg_notify(${channel}, '')`;
  } catch {
    // Intentionally ignore — recovery sweep must remain sufficient.
  }
}
