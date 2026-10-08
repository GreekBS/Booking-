import type {
  IOperatorCopilotProvider,
  OperatorCopilotHistoryMessage,
  OperatorCopilotProviderOutcome,
  OperatorCopilotToolCallRequest,
  OperatorCopilotToolDeclaration,
  OperatorCopilotToolResult,
  OperatorCopilotTurnRequest,
} from "@hcp/domain";

const PROVIDER_NAME = "gemini";
const DEFAULT_MODEL = "gemini-2.0-flash";
/** Slightly below the orchestrator's own PROVIDER_TIMEOUT_MS so we fail with a clean code. */
const REQUEST_TIMEOUT_MS = 18_000;
const MAX_FUNCTION_CALLS_PER_RESPONSE = 4;

type GeminiFunctionCall = {
  name: string;
  args: Record<string, unknown>;
  id?: string;
};

type GeminiPart =
  | { text: string }
  | {
      functionCall: GeminiFunctionCall;
      thoughtSignature?: string;
    }
  | {
      functionResponse: {
        name: string;
        response: Record<string, unknown>;
        id?: string;
      };
    };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiOperatorCopilotRequestBody {
  systemInstruction: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
  tools?: Array<{
    functionDeclarations: Array<{
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    }>;
  }>;
  toolConfig?: { functionCallingConfig: { mode: "AUTO" | "NONE" } };
  generationConfig: { temperature: number };
}

// ---------------------------------------------------------------------------
// Schema sanitizing — Gemini accepts an OpenAPI *subset*; unknown keys (e.g.
// additionalProperties, pattern, format: "uuid") are rejected with HTTP 400.
// ---------------------------------------------------------------------------

const SCHEMA_ALLOWED_KEYS = new Set([
  "type",
  "description",
  "properties",
  "required",
  "items",
  "enum",
  "nullable",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
]);

export function sanitizeGeminiSchema(schema: unknown): Record<string, unknown> {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return {};
  }
  const input = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SCHEMA_ALLOWED_KEYS.has(key)) continue;
    if (key === "properties" && typeof value === "object" && value !== null) {
      const props: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(value as Record<string, unknown>)) {
        props[name] = sanitizeGeminiSchema(sub);
      }
      out.properties = props;
    } else if (key === "items") {
      out.items = sanitizeGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function toFunctionDeclaration(tool: OperatorCopilotToolDeclaration) {
  const parameters = sanitizeGeminiSchema(tool.parameters);
  return {
    name: tool.name,
    description: tool.description,
    // Gemini rejects an OBJECT schema with an empty `properties` map.
    ...(parameters.properties &&
    Object.keys(parameters.properties as Record<string, unknown>).length > 0
      ? { parameters }
      : {}),
  } as { name: string; description: string; parameters: Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Request building
// ---------------------------------------------------------------------------

function parseToolContent(content: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { result: parsed };
  } catch {
    return { result: content };
  }
}

function pushContent(contents: GeminiContent[], next: GeminiContent): void {
  const last = contents[contents.length - 1];
  if (last && last.role === next.role) {
    last.parts.push(...next.parts);
    return;
  }
  contents.push({ role: next.role, parts: [...next.parts] });
}

function buildFunctionCallPart(result: OperatorCopilotToolResult): GeminiPart {
  const functionCall: GeminiFunctionCall = {
    name: result.name,
    args: result.arguments ?? {},
  };
  // Only echo a call id when Gemini originally supplied one — never invent.
  if (result.providerCallId?.trim()) {
    functionCall.id = result.providerCallId.trim();
  }
  const part: GeminiPart = { functionCall };
  if (result.thoughtSignature && result.thoughtSignature.length > 0) {
    (part as { thoughtSignature?: string }).thoughtSignature =
      result.thoughtSignature;
  }
  return part;
}

function buildFunctionResponsePart(result: OperatorCopilotToolResult): GeminiPart {
  const functionResponse: {
    name: string;
    response: Record<string, unknown>;
    id?: string;
  } = {
    name: result.name,
    response: parseToolContent(result.content),
  };
  if (result.providerCallId?.trim()) {
    functionResponse.id = result.providerCallId.trim();
  }
  return { functionResponse };
}

/**
 * Builds the generateContent body.
 *
 * Gemini 3+ contract (generateContent):
 * - Replay model functionCall parts with original args, provider call id, and
 *   thoughtSignature when present (never invent signatures/ids).
 * - Return FunctionResponse parts as role "user", one per call, with matching id.
 * - Parallel tool results from the current turn share one model turn + one user turn.
 * - Historical tool rows lack thought signatures → render as plain text.
 */
export function buildGeminiOperatorCopilotRequest(
  req: OperatorCopilotTurnRequest,
): GeminiOperatorCopilotRequestBody {
  const useFunctionParts = req.tools.length > 0;
  const contents: GeminiContent[] = [];

  const pushHistory = (m: OperatorCopilotHistoryMessage) => {
    if (m.role === "operator") {
      pushContent(contents, { role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      pushContent(contents, { role: "model", parts: [{ text: m.content }] });
    } else {
      // Historical tool exchanges are not stored with Gemini thought signatures.
      // Never fabricate signatures — render as text even when tools are offered.
      const name = m.toolName?.trim() || "tool";
      pushContent(contents, {
        role: "user",
        parts: [{ text: `[tool_result ${name}] ${m.content}` }],
      });
    }
  };

  for (const m of req.history) pushHistory(m);
  pushContent(contents, { role: "user", parts: [{ text: req.operatorRequest }] });

  const toolResults = req.toolResults ?? [];
  if (toolResults.length > 0) {
    if (useFunctionParts) {
      // One model turn with all functionCalls, then one user turn with all responses.
      pushContent(contents, {
        role: "model",
        parts: toolResults.map(buildFunctionCallPart),
      });
      pushContent(contents, {
        role: "user",
        parts: toolResults.map(buildFunctionResponsePart),
      });
    } else {
      for (const r of toolResults) {
        pushContent(contents, {
          role: "user",
          parts: [{ text: `[tool_result ${r.name}] ${r.content}` }],
        });
      }
    }
  }

  const systemText = [
    req.systemPolicy,
    "",
    "TRUSTED_CONTEXT (derived by Talos from the authenticated session; authoritative):",
    req.trustedContextJson,
  ].join("\n");

  return {
    systemInstruction: { parts: [{ text: systemText }] },
    contents,
    ...(useFunctionParts
      ? {
          tools: [{ functionDeclarations: req.tools.map(toFunctionDeclaration) }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" as const } },
        }
      : {}),
    generationConfig: { temperature: 0.2 },
  };
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface GeminiResponsePart {
  text?: string;
  thoughtSignature?: unknown;
  functionCall?: { name?: unknown; args?: unknown; id?: unknown };
}

interface GeminiResponseJson {
  candidates?: Array<{
    content?: {
      parts?: GeminiResponsePart[];
    };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

type ParsedResponse =
  | { kind: "text"; text: string }
  | { kind: "tool_calls"; toolCalls: OperatorCopilotToolCallRequest[] }
  | { kind: "invalid"; errorCode: string };

export function parseGeminiOperatorCopilotResponse(
  json: GeminiResponseJson,
): ParsedResponse {
  if (json.promptFeedback?.blockReason) {
    return { kind: "invalid", errorCode: "gemini_prompt_blocked" };
  }
  const candidate = json.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!candidate || !Array.isArray(parts) || parts.length === 0) {
    return { kind: "invalid", errorCode: "gemini_empty_response" };
  }

  const toolCalls: OperatorCopilotToolCallRequest[] = [];
  for (const part of parts) {
    if (!part.functionCall) continue;
    const { name, args, id } = part.functionCall;
    if (typeof name !== "string" || !name.trim()) {
      return { kind: "invalid", errorCode: "gemini_invalid_function_call" };
    }
    if (
      args !== undefined &&
      args !== null &&
      (typeof args !== "object" || Array.isArray(args))
    ) {
      return { kind: "invalid", errorCode: "gemini_invalid_function_call" };
    }

    const providerCallId =
      typeof id === "string" && id.trim() ? id.trim().slice(0, 128) : undefined;
    const thoughtSignature =
      typeof part.thoughtSignature === "string" && part.thoughtSignature.length > 0
        ? part.thoughtSignature
        : undefined;

    // Internal correlation id: prefer provider id; otherwise a local placeholder
    // used only for our DB/orchestrator (never sent back as a fabricated Gemini id).
    const internalId = providerCallId ?? `gemini-call-${toolCalls.length + 1}`;

    toolCalls.push({
      id: internalId,
      name: name.trim(),
      arguments: (args as Record<string, unknown> | undefined | null) ?? {},
      ...(thoughtSignature ? { thoughtSignature } : {}),
      ...(providerCallId ? { providerCallId } : {}),
    });
  }

  if (toolCalls.length > 0) {
    return {
      kind: "tool_calls",
      toolCalls: toolCalls.slice(0, MAX_FUNCTION_CALLS_PER_RESPONSE),
    };
  }

  const text = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
  if (!text) return { kind: "invalid", errorCode: "gemini_empty_response" };
  return { kind: "text", text };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Gemini function-calling adapter for the Operator Copilot.
 *
 * Fail-closed: missing key, timeout, HTTP error, or unparseable output all
 * return a `failure` outcome — never a heuristic substitute. Prompts, tool
 * payloads and model output are never logged.
 *
 * Env: GEMINI_API_KEY, GEMINI_MODEL (default gemini-2.0-flash).
 */
export class GeminiOperatorCopilotProvider implements IOperatorCopilotProvider {
  private readonly apiKey: string | null;
  private readonly model: string;

  constructor(options?: { apiKey?: string | null; model?: string }) {
    this.apiKey =
      options?.apiKey !== undefined
        ? options.apiKey?.trim() || null
        : process.env.GEMINI_API_KEY?.trim() || null;
    this.model =
      options?.model?.trim() || process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  }

  async completeTurn(
    req: OperatorCopilotTurnRequest,
  ): Promise<OperatorCopilotProviderOutcome> {
    const started = Date.now();
    const failure = (errorCode: string): OperatorCopilotProviderOutcome => ({
      type: "failure",
      errorCode,
      provider: PROVIDER_NAME,
      model: this.model,
      latencyMs: Date.now() - started,
      success: false,
    });

    if (!this.apiKey) return failure("gemini_api_key_missing");

    try {
      const body = buildGeminiOperatorCopilotRequest(req);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify(body),
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        return failure(
          res.status === 429 ? "gemini_rate_limited" : `gemini_http_${res.status}`,
        );
      }

      let json: GeminiResponseJson;
      try {
        json = (await res.json()) as GeminiResponseJson;
      } catch {
        return failure("gemini_invalid_json");
      }

      const parsed = parseGeminiOperatorCopilotResponse(json);
      if (parsed.kind === "invalid") return failure(parsed.errorCode);

      const common = {
        provider: PROVIDER_NAME,
        model: this.model,
        inputTokens: json.usageMetadata?.promptTokenCount ?? null,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
        latencyMs: Date.now() - started,
        success: true as const,
      };
      return parsed.kind === "tool_calls"
        ? { type: "tool_calls", toolCalls: parsed.toolCalls, ...common }
        : { type: "text", text: parsed.text, ...common };
    } catch (error) {
      const aborted =
        error instanceof Error &&
        (error.name === "AbortError" || /aborted/i.test(error.message));
      return failure(aborted ? "gemini_timeout" : "gemini_unavailable");
    }
  }
}
