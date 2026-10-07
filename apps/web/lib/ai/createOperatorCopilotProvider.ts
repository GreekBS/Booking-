import {
  HeuristicOperatorCopilotProvider,
  type IOperatorCopilotProvider,
  type OperatorCopilotProviderOutcome,
} from "@hcp/domain";
import { GeminiOperatorCopilotProvider } from "./GeminiOperatorCopilotProvider";

export type OperatorCopilotProviderKind = "gemini" | "heuristic" | "unavailable";

/** Always fails closed with a stable error code. */
export class UnavailableOperatorCopilotProvider implements IOperatorCopilotProvider {
  async completeTurn(): Promise<OperatorCopilotProviderOutcome> {
    return {
      type: "failure",
      errorCode: "operator_copilot_provider_unavailable",
      provider: "unavailable",
      model: "none",
      latencyMs: 0,
      success: false,
    };
  }
}

/**
 * AI_OPERATOR_COPILOT_PROVIDER:
 * - gemini (default) — fail-closed Gemini; missing key → failure outcome
 * - heuristic — deterministic test/demo fixture only (explicit opt-in)
 * - unavailable — always fail-closed
 */
export function resolveOperatorCopilotProviderKind(
  raw: string | undefined = process.env.AI_OPERATOR_COPILOT_PROVIDER,
): OperatorCopilotProviderKind {
  const value = (raw ?? "gemini").trim().toLowerCase();
  if (value === "heuristic" || value === "demo" || value === "test") {
    return "heuristic";
  }
  if (value === "unavailable" || value === "off" || value === "none") {
    return "unavailable";
  }
  return "gemini";
}

export function createOperatorCopilotProvider(options?: {
  kind?: OperatorCopilotProviderKind;
  apiKey?: string | null;
  model?: string;
}): IOperatorCopilotProvider {
  const kind = options?.kind ?? resolveOperatorCopilotProviderKind();
  switch (kind) {
    case "heuristic":
      return new HeuristicOperatorCopilotProvider();
    case "unavailable":
      return new UnavailableOperatorCopilotProvider();
    case "gemini":
    default:
      return new GeminiOperatorCopilotProvider({
        apiKey: options?.apiKey,
        model: options?.model,
      });
  }
}
