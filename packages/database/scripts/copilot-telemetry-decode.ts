/**
 * Decode Operator Copilot AiUsage.classification values (legacy + PR0).
 * Safe for read-only diag scripts — no I/O, no secrets.
 */

export const COPILOT_CLASSIFICATION_MAX = 32;

/** Legacy: http_attempts_N ; PR0 turn: rN|hN|tN|tmN|gmN ; PR0 round: rN|hN */
export type ParsedCopilotClassification =
  | { kind: "legacy_http_attempts"; httpAttempts: number }
  | {
      kind: "turn_v2";
      geminiRounds: number;
      httpAttemptsTotal: number;
      toolCallCount: number;
      toolLatencyMs: number;
      geminiLatencyMs: number;
    }
  | { kind: "round_v2"; roundIndex: number; httpAttempts: number }
  | { kind: "tool_name"; name: string }
  | { kind: "unknown"; raw: string | null };

export function parseCopilotClassification(
  value: string | null,
): ParsedCopilotClassification {
  if (value == null || value === "") return { kind: "unknown", raw: value };
  if (value.length > COPILOT_CLASSIFICATION_MAX) {
    return { kind: "unknown", raw: `[oversize:${value.length}]` };
  }
  const legacy = /^http_attempts_([1-9])$/.exec(value);
  if (legacy) {
    return { kind: "legacy_http_attempts", httpAttempts: Number(legacy[1]) };
  }
  const turn = /^r(\d)\|h(\d{1,2})\|t(\d)\|tm(\d{1,5})\|gm(\d{1,6})$/.exec(value);
  if (turn) {
    return {
      kind: "turn_v2",
      geminiRounds: Number(turn[1]),
      httpAttemptsTotal: Number(turn[2]),
      toolCallCount: Number(turn[3]),
      toolLatencyMs: Number(turn[4]),
      geminiLatencyMs: Number(turn[5]),
    };
  }
  const round = /^r([1-9])\|h(\d{1,2})$/.exec(value);
  if (round) {
    return {
      kind: "round_v2",
      roundIndex: Number(round[1]),
      httpAttempts: Number(round[2]),
    };
  }
  if (/^[a-z][a-z0-9_]{0,31}$/.test(value)) {
    return { kind: "tool_name", name: value };
  }
  return { kind: "unknown", raw: value };
}

export function looksSensitiveClassification(value: string | null): boolean {
  if (!value) return false;
  return /@|\bsk-|\bBearer\b|password|SELECT\s|INSERT\s|guest@|prompt/i.test(
    value,
  );
}
