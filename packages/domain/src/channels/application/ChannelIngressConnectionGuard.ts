import type { ChannelConnection } from "../domain/ChannelConnection";
import type { ChannelSource } from "../types/ChannelSource";

export type ChannelIngressConnectionRejectReason =
  | "not_found"
  | "not_active"
  | "provider_mismatch";

export type ChannelIngressConnectionValidationResult =
  | { ok: true; connection: ChannelConnection }
  | { ok: false; reason: ChannelIngressConnectionRejectReason };

export function validateChannelIngressConnection(
  connection: ChannelConnection | null,
  expectedProvider: ChannelSource,
): ChannelIngressConnectionValidationResult {
  if (!connection) {
    return { ok: false, reason: "not_found" };
  }

  if (connection.status !== "active") {
    return { ok: false, reason: "not_active" };
  }

  if (connection.provider !== expectedProvider) {
    return { ok: false, reason: "provider_mismatch" };
  }

  return { ok: true, connection };
}
