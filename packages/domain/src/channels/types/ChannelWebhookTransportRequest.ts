import type { ChannelSource } from "./ChannelSource";
import { encodeUtf8Bytes } from "../../shared/kernel/Utf8Bytes";

/**
 * Immutable provider-neutral webhook transport request.
 * Preserves raw bytes exactly as received for signature verification.
 */
export interface ChannelWebhookTransportRequest {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly provider: ChannelSource;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBodyBytes: Uint8Array;
  readonly queryParameters?: Readonly<Record<string, string>>;
  readonly routeParameters?: Readonly<Record<string, string>>;
  readonly receivedAt?: Date;
}

export function createChannelWebhookTransportRequest(params: {
  tenantId: string;
  connectionId: string;
  provider: ChannelSource;
  method?: string;
  headers?: Record<string, string>;
  rawBodyBytes: Uint8Array;
  queryParameters?: Record<string, string>;
  routeParameters?: Record<string, string>;
  receivedAt?: Date;
}): ChannelWebhookTransportRequest {
  return Object.freeze({
    tenantId: params.tenantId.trim(),
    connectionId: params.connectionId.trim(),
    provider: params.provider,
    method: (params.method ?? "POST").trim(),
    headers: Object.freeze({ ...(params.headers ?? {}) }),
    rawBodyBytes: params.rawBodyBytes.slice(),
    queryParameters: params.queryParameters ? Object.freeze({ ...params.queryParameters }) : undefined,
    routeParameters: params.routeParameters ? Object.freeze({ ...params.routeParameters }) : undefined,
    receivedAt: params.receivedAt,
  });
}

export function encodeChannelWebhookBody(text: string): Uint8Array {
  return encodeUtf8Bytes(text);
}
