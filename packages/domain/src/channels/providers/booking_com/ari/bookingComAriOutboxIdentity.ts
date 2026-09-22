import { sha256HexUtf8 } from "../../../utils/sha256Hex";
import { PUSH_BOOKING_COM_ARI_JOB_TYPE } from "../../../../platform/async/jobs/types/JobTypes";

export const BOOKING_COM_ARI_PUSH_OUTBOX_TAG = "booking-com-ari-push-outbox-v1";
export const BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE =
  "channel.booking_com.ari.push.requested.v1";
export const BOOKING_COM_ARI_PUSH_AGGREGATE_TYPE = "ChannelAriPush";

export interface BookingComAriPushOutboxIdentity {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly coalesceKey: string;
  readonly generation: number;
}

export function buildBookingComAriPushDeliveryKey(
  identity: BookingComAriPushOutboxIdentity,
): string {
  const canonical = [
    BOOKING_COM_ARI_PUSH_OUTBOX_TAG,
    identity.tenantId.trim(),
    identity.connectionId.trim(),
    identity.coalesceKey.trim(),
    String(identity.generation),
  ].join("\u0000");
  return sha256HexUtf8(canonical);
}

export function buildBookingComAriPushJobIdempotencyKey(input: {
  coalesceKey: string;
  generation: number;
}): string {
  return `${PUSH_BOOKING_COM_ARI_JOB_TYPE}:${input.coalesceKey.trim()}:g${input.generation}`;
}
