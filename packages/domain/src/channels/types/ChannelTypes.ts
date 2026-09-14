/**
 * Channels bounded context — shared types.
 * @see packages/domain/src/channels/ARCHITECTURE.md
 */

export type { ChannelSource } from "./ChannelSource";
export { CHANNEL_SOURCES } from "./ChannelSource";

/** Opaque payload from infrastructure adapters — never parsed in domain. */
export type ChannelImportPayload = Record<string, unknown>;

export interface ExternalReservationReference {
  source: import("./ChannelSource").ChannelSource;
  externalId: string;
}
