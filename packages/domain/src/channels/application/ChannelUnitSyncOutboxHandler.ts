import type { OutboxEntry } from "../../shared/types/index";
import type { IOutboxEventHandler } from "../../platform/async/ports/IOutboxEventHandler";
import { parseMutationOrigin } from "../../shared/types/MutationOrigin";
import type { ChannelUnitSyncChangeKind } from "../types/ChannelUnitSyncChange";
import { UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE } from "../types/ChannelUnitSyncChange";
import type { PropagateChannelUnitSyncUseCase } from "./PropagateChannelUnitSyncUseCase";

const COMMERCE_SYNC_EVENTS = new Set([
  "BookingCreated",
  "BookingConfirmed",
  "BookingCancelled",
  "BookingStayChanged",
  "BookingUnitChanged",
  "HoldCreated",
  "HoldReleased",
  "HoldExpired",
  UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE,
]);

/**
 * Durable Commerce → Channels fan-out. Never calls providers.
 * Idempotent via outbox entry identity → revision coalesce.
 */
export class ChannelUnitSyncOutboxHandler implements IOutboxEventHandler {
  constructor(private readonly propagate: PropagateChannelUnitSyncUseCase) {}

  canHandle(eventType: string): boolean {
    return COMMERCE_SYNC_EVENTS.has(eventType);
  }

  async handle(entry: OutboxEntry): Promise<void> {
    const tenantId = entry.tenantId;
    if (!tenantId) {
      throw new Error("Channel unit sync outbox entry missing tenantId");
    }

    const parsed = extractSyncCommand(entry);
    if (!parsed) {
      return; // ignore incomplete payloads (e.g. quote-only)
    }

    const result = await this.propagate.execute({
      tenantId,
      ...parsed,
      sourceEventId: entry.id,
      revision: parsed.revision,
    });
    if (result.isFailure) {
      throw result.getError();
    }
  }
}

function extractSyncCommand(entry: OutboxEntry): {
  unitId: string;
  propertyId: string;
  from: string;
  to: string;
  changeKinds: ChannelUnitSyncChangeKind[];
  mutationOrigin: ReturnType<typeof parseMutationOrigin>;
  revision: number;
} | null {
  const p = entry.payload;
  const mutationOrigin = parseMutationOrigin(p.mutationOrigin);

  if (entry.eventType === UNIT_EXTERNAL_SYNC_REQUIRED_EVENT_TYPE) {
    const unitId = asString(p.unitId);
    const propertyId = asString(p.propertyId);
    const from = asString(p.from);
    const to = asString(p.to);
    if (!unitId || !propertyId || !from || !to) return null;
    const kinds = Array.isArray(p.changeKinds)
      ? (p.changeKinds.filter(
          (k): k is ChannelUnitSyncChangeKind =>
            k === "availability" || k === "rates" || k === "restrictions",
        ) as ChannelUnitSyncChangeKind[])
      : (["availability", "rates", "restrictions"] as ChannelUnitSyncChangeKind[]);
    return {
      unitId,
      propertyId,
      from,
      to,
      changeKinds: kinds.length > 0 ? kinds : ["availability"],
      mutationOrigin,
      revision:
        typeof p.revision === "number" && Number.isFinite(p.revision)
          ? p.revision
          : Date.parse(String(entry.id)) || Date.now(),
    };
  }

  const unitId = asString(p.unitId);
  const propertyId = asString(p.propertyId);
  let from = asString(p.checkIn);
  let to = asString(p.checkOut);

  // Stay change carries before/after ranges — union them for availability reopen/close.
  if (entry.eventType === "BookingStayChanged" || entry.eventType === "BookingUnitChanged") {
    const before = p.before as Record<string, unknown> | undefined;
    const after = p.after as Record<string, unknown> | undefined;
    const dates = [
      asString(before?.checkIn),
      asString(before?.checkOut),
      asString(after?.checkIn),
      asString(after?.checkOut),
      from,
      to,
    ].filter((d): d is string => !!d);
    if (dates.length >= 2) {
      dates.sort();
      from = dates[0]!;
      to = dates[dates.length - 1]!;
    }
    const afterUnit = asString(after?.unitId) ?? unitId;
    const afterProperty = asString(after?.propertyId) ?? propertyId;
    if (!afterUnit || !afterProperty || !from || !to) return null;
    return {
      unitId: afterUnit,
      propertyId: afterProperty,
      from,
      to,
      changeKinds: ["availability"],
      mutationOrigin,
      revision: Date.now(),
    };
  }

  if (!unitId || !propertyId || !from || !to) return null;

  return {
    unitId,
    propertyId,
    from,
    to,
    changeKinds: ["availability"],
    mutationOrigin,
    revision: Date.now(),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
