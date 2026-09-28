import type {
  AssistantGenerateRequest,
  AssistantGenerateResult,
  IAssistantProvider,
} from "@hcp/domain";
import { createAssistantProviderFailureResult } from "@hcp/domain";

/**
 * Gemini Flash Free Tier adapter behind IAssistantProvider.
 *
 * Fail-closed: never substitutes HeuristicAssistantProvider. Missing key,
 * timeouts, HTTP errors, and invalid JSON all return a provider-failure
 * result (no guest draft, no Autopilot send).
 *
 * Model via GEMINI_MODEL (default: gemini-2.0-flash).
 */
export class GeminiAssistantProvider implements IAssistantProvider {
  private readonly apiKey: string | null;
  private readonly model: string;

  constructor(options?: { apiKey?: string | null; model?: string }) {
    this.apiKey =
      options?.apiKey ?? process.env.GEMINI_API_KEY?.trim() ?? null;
    this.model =
      options?.model?.trim() ||
      process.env.GEMINI_MODEL?.trim() ||
      "gemini-2.0-flash";
  }

  async generate(
    req: AssistantGenerateRequest,
  ): Promise<AssistantGenerateResult> {
    if (!this.apiKey) {
      return createAssistantProviderFailureResult({
        errorCode: "gemini_api_key_missing",
        provider: "gemini",
        model: this.model,
        operation: req.operation,
        ownerRawReply: req.ownerRawReply,
      });
    }

    const started = Date.now();
    try {
      const prompt = buildPrompt(req);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: "application/json",
            },
          }),
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const errorCode =
          res.status === 429
            ? "gemini_rate_limited"
            : res.status >= 500
              ? `gemini_http_${res.status}`
              : `http_${res.status}`;
        return createAssistantProviderFailureResult({
          errorCode,
          provider: "gemini",
          model: this.model,
          latencyMs: Date.now() - started,
          operation: req.operation,
          ownerRawReply: req.ownerRawReply,
        });
      }

      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
        };
      };
      const text =
        json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
        "";
      const parsed = parseAssistantJson(text);
      if (!parsed) {
        return createAssistantProviderFailureResult({
          errorCode: "gemini_invalid_structured_output",
          provider: "gemini",
          model: this.model,
          latencyMs: Date.now() - started,
          operation: req.operation,
          ownerRawReply: req.ownerRawReply,
        });
      }

      return {
        classification: parsed.classification,
        replyText: parsed.replyText,
        requiresEscalation: parsed.requiresEscalation,
        escalationReason: parsed.escalationReason,
        escalationSummary: parsed.escalationSummary,
        unansweredTopics: parsed.unansweredTopics,
        knowledgeSourceIds: parsed.knowledgeSourceIds,
        safetyFlags: parsed.safetyFlags,
        guestLanguage: parsed.guestLanguage,
        provider: "gemini",
        model: this.model,
        inputTokens: json.usageMetadata?.promptTokenCount ?? null,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
        latencyMs: Date.now() - started,
        success: true,
        errorCode: null,
      };
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message));
      return createAssistantProviderFailureResult({
        errorCode: aborted ? "gemini_timeout" : "gemini_unavailable",
        provider: "gemini",
        model: this.model,
        latencyMs: Date.now() - started,
        operation: req.operation,
        ownerRawReply: req.ownerRawReply,
      });
    }
  }
}

function buildPrompt(req: AssistantGenerateRequest): string {
  const ctx = {
    property: {
      ...req.context.property,
      amenities: req.context.property.amenities.map((a) => ({
        id: a.id,
        name: a.name,
        knowledgeSourceId: `amenity:${a.id}`,
      })),
    },
    knowledge: req.context.knowledge,
    faqs: req.context.faqs.map((f) => ({
      ...f,
      knowledgeSourceId: `faq:${f.id}`,
    })),
    style: req.context.style,
    stay: req.context.stay,
    recentMessages: req.context.recentMessages,
  };

  if (req.operation === "polish_owner_decision") {
    return `You are Talos Property AI receptionist. Polish the owner's raw decision into a guest-facing reply.
Rules:
- Use guest language and Property style.
- Do NOT invent Property facts.
- Do NOT copy the owner message verbatim; rewrite warmly.
- Never approve refunds/cancellations/price changes.

Return ONLY JSON:
{"classification":"ANSWERABLE","replyText":"...","requiresEscalation":false,"escalationReason":null,"escalationSummary":null,"unansweredTopics":[],"knowledgeSourceIds":["owner_decision"],"safetyFlags":[],"guestLanguage":"en"|"el"}

Owner raw reply: ${JSON.stringify(req.ownerRawReply ?? "")}
Guest message: ${JSON.stringify(req.inboundMessage)}
Context: ${JSON.stringify(ctx)}`;
  }

  return `You are Talos Property AI receptionist. Classify the guest message using ONLY the provided context.
Rules:
- Property-specific facts MUST cite knowledgeSourceIds from context (e.g. amenity:{id}, guest_knowledge.wifi_password, faq:{id}, policy.check_in_time).
- Amenity presence answers "do you have X?" only — never invent passwords, codes, or location instructions from amenities alone.
- Wi-Fi password requires guest_knowledge.wifi_password (and optionally wifi_ssid). Amenity Wi-Fi alone is insufficient for password questions.
- If missing authoritative info → classification UNKNOWN, replyText null, requiresEscalation true.
- Early check-in / late checkout / discounts / special services needing approval → REQUIRES_OWNER_DECISION.
- Refunds/cancellations/payment/inventory mutations → BLOCKED.
- Never invent Wi-Fi credentials, parking directions, rules, or local recommendations.

Return ONLY JSON:
{"classification":"ANSWERABLE"|"UNKNOWN"|"REQUIRES_OWNER_DECISION"|"BLOCKED","replyText":string|null,"requiresEscalation":boolean,"escalationReason":string|null,"escalationSummary":string|null,"unansweredTopics":string[],"knowledgeSourceIds":string[],"safetyFlags":string[],"guestLanguage":"en"|"el"|null}

Guest message: ${JSON.stringify(req.inboundMessage)}
Context: ${JSON.stringify(ctx)}`;
}

function parseAssistantJson(text: string): {
  classification: AssistantGenerateResult["classification"];
  replyText: string | null;
  requiresEscalation: boolean;
  escalationReason: string | null;
  escalationSummary: string | null;
  unansweredTopics: string[];
  knowledgeSourceIds: string[];
  safetyFlags: string[];
  guestLanguage: string | null;
} | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const classification = String(raw.classification ?? "UNKNOWN");
    if (
      !["ANSWERABLE", "UNKNOWN", "REQUIRES_OWNER_DECISION", "BLOCKED"].includes(
        classification,
      )
    ) {
      return null;
    }
    return {
      classification: classification as AssistantGenerateResult["classification"],
      replyText: typeof raw.replyText === "string" ? raw.replyText : null,
      requiresEscalation: Boolean(raw.requiresEscalation),
      escalationReason:
        typeof raw.escalationReason === "string" ? raw.escalationReason : null,
      escalationSummary:
        typeof raw.escalationSummary === "string"
          ? raw.escalationSummary
          : null,
      unansweredTopics: Array.isArray(raw.unansweredTopics)
        ? raw.unansweredTopics.map(String)
        : [],
      knowledgeSourceIds: Array.isArray(raw.knowledgeSourceIds)
        ? raw.knowledgeSourceIds.map(String)
        : [],
      safetyFlags: Array.isArray(raw.safetyFlags)
        ? raw.safetyFlags.map(String)
        : [],
      guestLanguage:
        typeof raw.guestLanguage === "string" ? raw.guestLanguage : null,
    };
  } catch {
    return null;
  }
}
