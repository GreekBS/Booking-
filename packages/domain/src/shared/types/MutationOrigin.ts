/**
 * Provider-agnostic mutation provenance.
 * Established only by trusted server-side application/ingress code — never from browsers.
 */

export type MutationOriginKind =
  | "direct"
  | "operator"
  | "booking_engine"
  | "channel";

export interface ChannelMutationOriginRef {
  /** ChannelSource value (string to keep Commerce free of provider adapters). */
  readonly provider: string;
  readonly connectionId: string;
  readonly externalReservationId?: string | null;
}

export interface MutationOrigin {
  readonly kind: MutationOriginKind;
  readonly channel?: ChannelMutationOriginRef | null;
}

export function mutationOriginDirect(): MutationOrigin {
  return { kind: "direct", channel: null };
}

export function mutationOriginOperator(): MutationOrigin {
  return { kind: "operator", channel: null };
}

export function mutationOriginBookingEngine(): MutationOrigin {
  return { kind: "booking_engine", channel: null };
}

export function mutationOriginChannel(input: {
  provider: string;
  connectionId: string;
  externalReservationId?: string | null;
}): MutationOrigin {
  return {
    kind: "channel",
    channel: {
      provider: input.provider.trim(),
      connectionId: input.connectionId.trim(),
      externalReservationId: input.externalReservationId ?? null,
    },
  };
}

export function parseMutationOrigin(
  value: unknown,
): MutationOrigin | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (
    kind !== "direct" &&
    kind !== "operator" &&
    kind !== "booking_engine" &&
    kind !== "channel"
  ) {
    return null;
  }
  if (kind !== "channel") {
    return { kind, channel: null };
  }
  const channel = record.channel;
  if (channel == null || typeof channel !== "object" || Array.isArray(channel)) {
    return null;
  }
  const ch = channel as Record<string, unknown>;
  if (typeof ch.provider !== "string" || typeof ch.connectionId !== "string") {
    return null;
  }
  return mutationOriginChannel({
    provider: ch.provider,
    connectionId: ch.connectionId,
    externalReservationId:
      typeof ch.externalReservationId === "string"
        ? ch.externalReservationId
        : null,
  });
}

/** Serialize for durable outbox / domain event payloads. */
export function mutationOriginToPayload(
  origin: MutationOrigin | null | undefined,
): Record<string, unknown> | null {
  if (!origin) return null;
  return {
    kind: origin.kind,
    channel: origin.channel
      ? {
          provider: origin.channel.provider,
          connectionId: origin.channel.connectionId,
          externalReservationId: origin.channel.externalReservationId ?? null,
        }
      : null,
  };
}
