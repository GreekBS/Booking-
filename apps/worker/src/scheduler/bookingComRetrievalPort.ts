import type { ProviderRetrievalSchedulerPort } from "./types";
import {
  createBookingComProviderRetrievalPort as createDomainBookingComRetrievalPort,
  type BookingComRetrievalPortDeps,
  type BookingComConnectionPollTarget,
} from "@hcp/domain";

export type { BookingComRetrievalPortDeps, BookingComConnectionPollTarget };

/**
 * Worker adapter around the domain Booking.com retrieval port.
 */
export function createBookingComProviderRetrievalPort(
  deps: BookingComRetrievalPortDeps,
): ProviderRetrievalSchedulerPort {
  const port = createDomainBookingComRetrievalPort(deps);
  return {
    providerId: port.providerId,
    retrieveAndIngress: (ctx) =>
      port.retrieveAndIngress({
        signal: ctx.signal,
        now: typeof ctx.now === "function" ? ctx.now() : ctx.now,
      }),
  };
}
