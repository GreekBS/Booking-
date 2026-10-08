/**
 * Sanitized Operator Copilot performance telemetry helpers.
 *
 * Encodes metrics into existing AiUsageRecord fields without migrations:
 * - turn `latencyMs` = wall-clock
 * - turn `classification` = compact counters (≤32 chars)
 * - per-round rows use operation `operator_copilot_round`
 *
 * NEVER encode prompts, messages, tool payloads, guest PII or secrets.
 */

/** AiUsageRecord.classification is VarChar(32). */
export const COPILOT_CLASSIFICATION_MAX_CHARS = 32;

export interface CopilotTurnTelemetrySnapshot {
  /** Gemini generateContent rounds completed in this turn (incl. failures). */
  geminiRounds: number;
  /** Sum of HTTP attempts across rounds (incl. retries). */
  httpAttemptsTotal: number;
  /** Domain tools executed (not counting rejected over-cap stubs). */
  toolCallCount: number;
  /** Aggregate tool execution time (ms). */
  toolLatencyMs: number;
  /** Sum of provider-reported Gemini round latencies (ms). */
  geminiLatencyMs: number;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * Compact turn classification, e.g. `r2|h3|t1|tm45|gm1200`.
 * Safe for aggregation dashboards; contains only integers.
 */
export function buildCopilotTurnClassification(
  snap: CopilotTurnTelemetrySnapshot,
): string {
  const r = clampInt(snap.geminiRounds, 0, 9);
  const h = clampInt(snap.httpAttemptsTotal, 0, 99);
  const t = clampInt(snap.toolCallCount, 0, 9);
  const tm = clampInt(snap.toolLatencyMs, 0, 99_999);
  const gm = clampInt(snap.geminiLatencyMs, 0, 999_999);
  const encoded = `r${r}|h${h}|t${t}|tm${tm}|gm${gm}`;
  return encoded.length <= COPILOT_CLASSIFICATION_MAX_CHARS
    ? encoded
    : encoded.slice(0, COPILOT_CLASSIFICATION_MAX_CHARS);
}

/**
 * Per-Gemini-round classification, e.g. `r1|h2` (1-based round index).
 */
export function buildCopilotRoundClassification(
  roundIndex1Based: number,
  httpAttempts: number,
): string {
  const r = clampInt(roundIndex1Based, 1, 9);
  const h = clampInt(httpAttempts, 0, 99);
  const encoded = `r${r}|h${h}`;
  return encoded.length <= COPILOT_CLASSIFICATION_MAX_CHARS
    ? encoded
    : encoded.slice(0, COPILOT_CLASSIFICATION_MAX_CHARS);
}

/** True when a string looks like a sanitized turn classification (not free text). */
export function isSanitizedCopilotTurnClassification(value: string): boolean {
  return /^r\d\|h\d{1,2}\|t\d\|tm\d{1,5}\|gm\d{1,6}$/.test(value);
}

/** Parse turn classification back to counters (for tests / readonly diag). */
export function parseCopilotTurnClassification(
  value: string,
): CopilotTurnTelemetrySnapshot | null {
  const m = /^r(\d)\|h(\d{1,2})\|t(\d)\|tm(\d{1,5})\|gm(\d{1,6})$/.exec(value);
  if (!m) return null;
  return {
    geminiRounds: Number(m[1]),
    httpAttemptsTotal: Number(m[2]),
    toolCallCount: Number(m[3]),
    toolLatencyMs: Number(m[4]),
    geminiLatencyMs: Number(m[5]),
  };
}
