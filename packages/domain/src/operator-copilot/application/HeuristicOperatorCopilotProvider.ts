import type {
  IOperatorCopilotProvider,
  OperatorCopilotProviderOutcome,
  OperatorCopilotTurnRequest,
} from "../ports/IOperatorCopilotProvider";

const PROVIDER_NAME = "heuristic";
const MODEL_NAME = "heuristic-v1";
const TOOL_DIRECTIVE_RE = /__tool__:([a-z_][a-z0-9_]*)(?::(\{[\s\S]*\}))?/i;
const FAIL_DIRECTIVE = "__fail__";
const RESULT_PREVIEW_CHARS = 300;

/**
 * Deterministic provider for tests / explicit demo selection only.
 * Never substitute silently for a real provider failure.
 *
 * Directives in the operator request:
 * - `__fail__`                    → failure outcome
 * - `__tool__:name:{json}`        → one tool_calls outcome; once `toolResults`
 *                                   are present on the next call → text summary
 * - anything else                 → acknowledging text
 */
export class HeuristicOperatorCopilotProvider implements IOperatorCopilotProvider {
  private calls = 0;

  /** Number of completeTurn invocations seen by this instance. */
  get callCount(): number {
    return this.calls;
  }

  async completeTurn(
    req: OperatorCopilotTurnRequest,
  ): Promise<OperatorCopilotProviderOutcome> {
    const started = Date.now();
    this.calls += 1;
    const request = req.operatorRequest ?? "";

    if (request.includes(FAIL_DIRECTIVE)) {
      return {
        type: "failure",
        errorCode: "heuristic_forced_failure",
        provider: PROVIDER_NAME,
        model: MODEL_NAME,
        latencyMs: Date.now() - started,
        success: false,
      };
    }

    // Tool results already gathered this turn → summarize and finish.
    if (req.toolResults && req.toolResults.length > 0) {
      return this.text(this.summarizeToolResults(req.toolResults), started);
    }

    const match = TOOL_DIRECTIVE_RE.exec(request);
    if (match) {
      const name = match[1]!;
      let args: Record<string, unknown> = {};
      if (match[2]) {
        try {
          const parsed: unknown = JSON.parse(match[2]);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            return this.badDirective(started);
          }
          args = parsed as Record<string, unknown>;
        } catch {
          return this.badDirective(started);
        }
      }
      return {
        type: "tool_calls",
        toolCalls: [{ id: `heuristic-call-${this.calls}`, name, arguments: args }],
        provider: PROVIDER_NAME,
        model: MODEL_NAME,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - started,
        success: true,
      };
    }

    const preview = request.replace(/\s+/g, " ").trim().slice(0, 120);
    return this.text(
      `I received your request${preview ? ` ("${preview}")` : ""}. ` +
        `I can look up bookings, availability, calendars, housekeeping, tasks, messages and escalations for you (read-only). ` +
        `Tell me what you would like to check.`,
      started,
    );
  }

  private badDirective(started: number): OperatorCopilotProviderOutcome {
    return {
      type: "failure",
      errorCode: "heuristic_bad_tool_directive",
      provider: PROVIDER_NAME,
      model: MODEL_NAME,
      latencyMs: Date.now() - started,
      success: false,
    };
  }

  private text(text: string, started: number): OperatorCopilotProviderOutcome {
    return {
      type: "text",
      text,
      provider: PROVIDER_NAME,
      model: MODEL_NAME,
      inputTokens: null,
      outputTokens: null,
      latencyMs: Date.now() - started,
      success: true,
    };
  }

  private summarizeToolResults(
    results: NonNullable<OperatorCopilotTurnRequest["toolResults"]>,
  ): string {
    const lines = results.map((r) => {
      let status = "returned data";
      try {
        const parsed = JSON.parse(r.content) as { ok?: boolean; errorCode?: string };
        if (parsed.ok === false) status = `failed (${parsed.errorCode ?? "error"})`;
        else if (parsed.ok === true) status = "succeeded";
      } catch {
        // content may be a truncation envelope or non-JSON; fall through
      }
      const preview =
        r.content.length > RESULT_PREVIEW_CHARS
          ? `${r.content.slice(0, RESULT_PREVIEW_CHARS)}…`
          : r.content;
      return `- ${r.name} ${status}: ${preview}`;
    });
    return `Here is what I found:\n${lines.join("\n")}`;
  }
}
