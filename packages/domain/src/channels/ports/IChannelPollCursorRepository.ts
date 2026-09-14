import type { ChannelPollCursor } from "../types/ChannelPollCursor";

export interface AdvanceChannelPollCursorParams {
  tenantId: string;
  connectionId: string;
  observedSemanticConfigVersion: number;
  /**
   * Compare-and-swap guard. Use `0` when no cursor row is expected.
   * Must equal the current cursor version on update.
   */
  expectedCursorVersion: number;
  nextPayload: string;
}

export interface ResetPollCursorBaselineParams {
  tenantId: string;
  connectionId: string;
  /**
   * Semantic epoch after the mutation that triggered baseline reset.
   * Written onto the retained cursor row when present.
   */
  semanticConfigVersion: number;
  /**
   * Canonical empty-digest cursor payload. Callers should pass
   * EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD (or buildEmptyIcalCursorBaselinePayload()).
   */
  baselinePayload: string;
}

export interface ResetPollCursorBaselineResult {
  /**
   * true when an existing cursor row was updated in place (version retained).
   * false when no cursor row existed — next create must consult reconciliation history.
   */
  readonly cursorRowUpdated: boolean;
  readonly retainedVersion: number | null;
}

export interface IChannelPollCursorRepository {
  getCursor(tenantId: string, connectionId: string): Promise<ChannelPollCursor | null>;

  /**
   * Creates or advances the cursor under connection serialization,
   * cursor-version CAS, semantic-epoch CAS, and the S6c monotonic nextVersion rule:
   *
   * nextVersion = max(current.version|0, MAX(recon.cursor_version)|0) + 1
   *
   * Throws ConflictError for a stale cursor or semantic epoch.
   */
  advanceCursor(params: AdvanceChannelPollCursorParams): Promise<ChannelPollCursor>;

  /**
   * Semantic-epoch baseline reset that preserves durable generation numbering.
   * If a cursor row exists: retain version, set semanticConfigVersion, set baseline payload.
   * If absent: do not create version 1 — next advanceCursor consults reconciliation history.
   *
   * Must never DELETE the cursor solely to restart numbering.
   */
  resetPollCursorBaseline(
    params: ResetPollCursorBaselineParams,
  ): Promise<ResetPollCursorBaselineResult>;
}
