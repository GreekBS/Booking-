import {
  GeminiAssistantProvider,
} from "./GeminiAssistantProvider";
import {
  HeuristicAssistantProvider,
  UnavailableAssistantProvider,
  type IAssistantProvider,
} from "@hcp/domain";

export type AssistantProviderKind = "gemini" | "heuristic" | "unavailable";

/**
 * Explicit provider selection. Never silently substitutes heuristic for Gemini.
 *
 * AI_ASSISTANT_PROVIDER:
 * - gemini (default) — fail-closed Gemini; missing key → unavailable result
 * - heuristic — deterministic test/demo fixture only
 * - unavailable — always fail-closed
 */
export function resolveAssistantProviderKind(
  raw: string | undefined = process.env.AI_ASSISTANT_PROVIDER,
): AssistantProviderKind {
  const value = (raw ?? "gemini").trim().toLowerCase();
  if (value === "heuristic" || value === "demo" || value === "test") {
    return "heuristic";
  }
  if (value === "unavailable" || value === "off" || value === "none") {
    return "unavailable";
  }
  return "gemini";
}

export function createAssistantProvider(options?: {
  kind?: AssistantProviderKind;
  apiKey?: string | null;
  model?: string;
}): IAssistantProvider {
  const kind = options?.kind ?? resolveAssistantProviderKind();
  switch (kind) {
    case "heuristic":
      return new HeuristicAssistantProvider();
    case "unavailable":
      return new UnavailableAssistantProvider();
    case "gemini":
    default:
      return new GeminiAssistantProvider({
        apiKey: options?.apiKey,
        model: options?.model,
      });
  }
}
