/**
 * Provider retrieval port contract used by the always-on worker scheduler.
 * Lives in domain so Booking.com tests can exercise it without importing apps/worker.
 */

export interface BookingComConnectionPollTarget {
  tenantId: string;
  connectionId: string;
}

export interface BookingComRetrievalPortDeps {
  listActiveBookingComConnections: () => Promise<
    readonly BookingComConnectionPollTarget[]
  >;
  executePollConnection: (target: BookingComConnectionPollTarget) => Promise<void>;
}

export interface BookingComProviderRetrievalPort {
  readonly providerId: "booking_com";
  retrieveAndIngress(ctx: {
    signal: AbortSignal;
    now: Date;
  }): Promise<void>;
}

export function createBookingComProviderRetrievalPort(
  deps: BookingComRetrievalPortDeps,
): BookingComProviderRetrievalPort {
  return {
    providerId: "booking_com",
    retrieveAndIngress: async (ctx) => {
      if (ctx.signal.aborted) return;
      const connections = await deps.listActiveBookingComConnections();
      for (const target of connections) {
        if (ctx.signal.aborted) return;
        await deps.executePollConnection(target);
      }
    },
  };
}
