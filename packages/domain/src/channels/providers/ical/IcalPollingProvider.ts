import { ValidationError } from "../../../shared/errors/DomainError";
import type { ChannelPollResult } from "../../types/ChannelProviderMessage";
import type { ChannelPollExecutionContext } from "../../types/ChannelTransportExecutionContext";
import type { IChannelPollingProvider } from "../../ports/providers/IChannelPollingProvider";
import { parseIcalCalendar } from "./parse/parseIcalCalendar";
import { mapIcalCalendar } from "./map/mapIcalCalendar";
import { buildIcalSnapshotIndex } from "./map/buildIcalSnapshotIndex";
import type { IcalMapIssueCode } from "./map/icalMapIssueCodes";
import { buildIcalInventoryActionableSnapshot } from "./inventory/buildIcalInventoryActionableSnapshot";
import { buildIcalInboundIngressItems } from "./ingress/buildIcalInboundIngressItems";
import type {
  IIcalTrustedIngressPollingProvider,
  IcalPollTrustedIngressResult,
} from "./ingress/IIcalTrustedIngressPollingProvider";
import type { IIcalFeedFetcher } from "./ports/IIcalFeedFetcher";

const CURSOR_MAP_ISSUE_CODES = new Set<IcalMapIssueCode>([
  "CURSOR_INVALID",
  "CURSOR_UNSUPPORTED_VERSION",
]);

/**
 * Provider-1 P1-S5 — fetch → parse → map → trusted ingress build.
 * Does not persist cursors or write Inbox.
 */
export class IcalPollingProvider
  implements IChannelPollingProvider, IIcalTrustedIngressPollingProvider
{
  constructor(private readonly feedFetcher: IIcalFeedFetcher) {}

  async poll(
    connectionId: string,
    cursor: string | null,
    context: ChannelPollExecutionContext,
  ): Promise<ChannelPollResult> {
    const trusted = await this.pollTrustedIngress(connectionId, cursor, context);
    return {
      messages: trusted.items.map((item) => item.message),
      nextCursor: trusted.nextCursor,
    };
  }

  async pollTrustedIngress(
    connectionId: string,
    cursor: string | null,
    context: ChannelPollExecutionContext,
  ): Promise<IcalPollTrustedIngressResult> {
    const feedUrl = context.credentialMaterial?.feedUrl?.trim();
    if (!feedUrl) {
      throw new ValidationError("Credential material feedUrl is required");
    }

    const fetched = await this.feedFetcher.fetch(feedUrl);
    const calendar = parseIcalCalendar(fetched.body);
    const batch = mapIcalCalendar({
      calendar,
      previousCursorPayload: cursor,
    });
    const items = buildIcalInboundIngressItems(batch.records, connectionId);
    const mapIssueCodes = batch.mapIssues
      .map((issue) => issue.code)
      .filter((code): code is IcalMapIssueCode => CURSOR_MAP_ISSUE_CODES.has(code));

    if (batch.proposedCursorPayload.trim().length === 0) {
      throw new ValidationError("map proposed cursor payload must not be empty");
    }

    // FULL current snapshot for S6a inventory — independent of S4b evidence record count.
    // Rebuild from the same parsed calendar (map already built an equivalent index).
    const currentSnapshot = buildIcalSnapshotIndex(calendar);
    const inventoryProjection = buildIcalInventoryActionableSnapshot(currentSnapshot);

    return {
      items,
      nextCursor: batch.proposedCursorPayload,
      mapIssueCodes,
      evidenceRecordCount: batch.records.length,
      inventoryActionableSnapshot: inventoryProjection.ok ? inventoryProjection.snapshot : null,
      inventoryProjectionFailureCode: inventoryProjection.ok ? null : inventoryProjection.code,
    };
  }
}
