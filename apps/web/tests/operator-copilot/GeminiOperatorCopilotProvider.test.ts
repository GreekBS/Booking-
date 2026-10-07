import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperatorCopilotTurnRequest } from "@hcp/domain";
import {
  GeminiOperatorCopilotProvider,
  buildGeminiOperatorCopilotRequest,
  sanitizeGeminiSchema,
} from "@/lib/ai/GeminiOperatorCopilotProvider";
import {
  UnavailableOperatorCopilotProvider,
  createOperatorCopilotProvider,
  resolveOperatorCopilotProviderKind,
} from "@/lib/ai/createOperatorCopilotProvider";

const request: OperatorCopilotTurnRequest = {
  systemPolicy: "POLICY",
  operatorRequest: "What is happening today?",
  trustedContextJson: '{"activePropertyId":"p1"}',
  history: [
    { role: "operator", content: "earlier question" },
    { role: "assistant", content: "earlier answer" },
    { role: "tool", content: '{"ok":true}', toolName: "get_today_overview", toolCallId: "c0" },
    { role: "assistant", content: "answer after tool" },
  ],
  tools: [
    {
      name: "get_housekeeping_today",
      description: "hk",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "string", format: "uuid", pattern: "^x$", description: "p" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "get_property_catalog",
      description: "catalog",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ],
  toolResults: [
    {
      toolCallId: "c1",
      name: "get_housekeeping_today",
      content: '{"ok":true,"data":{}}',
      arguments: { propertyId: "p1" },
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Gemini request building", () => {
  it("maps roles, system instruction and function declarations", () => {
    const body = buildGeminiOperatorCopilotRequest(request);

    expect(body.systemInstruction.parts[0]!.text).toContain("POLICY");
    expect(body.systemInstruction.parts[0]!.text).toContain('{"activePropertyId":"p1"}');

    // Consecutive same-role turns are merged (answer + functionCall share a model turn).
    expect(body.contents.map((c) => c.role)).toEqual([
      "user", // earlier question
      "model", // earlier answer + historical functionCall
      "function", // historical functionResponse
      "model", // answer after tool
      "user", // current operator request
      "model", // this-turn functionCall
      "function", // this-turn functionResponse
    ]);

    const declarations = body.tools![0]!.functionDeclarations;
    expect(declarations.map((d) => d.name)).toEqual([
      "get_housekeeping_today",
      "get_property_catalog",
    ]);
    // Unsupported schema keywords are stripped; empty-object params omitted.
    expect(JSON.stringify(declarations[0]!.parameters)).not.toMatch(
      /additionalProperties|pattern|uuid/,
    );
    expect(declarations[1]!.parameters).toBeUndefined();
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: "AUTO" } });
  });

  it("preserves original tool-call arguments on the echoed functionCall", () => {
    const body = buildGeminiOperatorCopilotRequest(request);
    const thisTurnModel = body.contents[body.contents.length - 2]!;
    const thisTurnFn = body.contents[body.contents.length - 1]!;
    expect(thisTurnModel.role).toBe("model");
    expect(thisTurnFn.role).toBe("function");

    const callPart = thisTurnModel.parts.find(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
        "functionCall" in p,
    );
    const responsePart = thisTurnFn.parts.find(
      (p): p is { functionResponse: { name: string; response: Record<string, unknown> } } =>
        "functionResponse" in p,
    );
    expect(callPart?.functionCall).toEqual({
      name: "get_housekeeping_today",
      args: { propertyId: "p1" },
    });
    expect(responsePart?.functionResponse.name).toBe("get_housekeeping_today");
    expect(responsePart?.functionResponse.response).toEqual({ ok: true, data: {} });
  });

  it("preserves distinct args across sequential toolResults in one turn", () => {
    const body = buildGeminiOperatorCopilotRequest({
      ...request,
      toolResults: [
        {
          toolCallId: "t1",
          name: "get_today_overview",
          content: '{"ok":true,"data":{"arrivalsToday":2}}',
          arguments: { propertyId: "p1" },
        },
        {
          toolCallId: "t2",
          name: "get_housekeeping_today",
          content: '{"ok":true,"data":{"dirty":1}}',
          arguments: { propertyId: "p1" },
        },
      ],
    });

    const functionCalls = body.contents
      .filter((c) => c.role === "model")
      .flatMap((c) => c.parts)
      .filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          "functionCall" in p,
      )
      .map((p) => p.functionCall);

    // History tool (empty args) + two this-turn toolResults with real args.
    expect(functionCalls.at(-2)).toEqual({
      name: "get_today_overview",
      args: { propertyId: "p1" },
    });
    expect(functionCalls.at(-1)).toEqual({
      name: "get_housekeeping_today",
      args: { propertyId: "p1" },
    });

    const responses = body.contents
      .filter((c) => c.role === "function")
      .flatMap((c) => c.parts)
      .filter(
        (p): p is { functionResponse: { name: string; response: Record<string, unknown> } } =>
          "functionResponse" in p,
      )
      .map((p) => p.functionResponse);
    expect(responses.at(-2)?.name).toBe("get_today_overview");
    expect(responses.at(-1)?.name).toBe("get_housekeeping_today");
  });

  it("renders tool traffic as text and omits tools on the final round", () => {
    const body = buildGeminiOperatorCopilotRequest({ ...request, tools: [] });
    expect(body.tools).toBeUndefined();
    expect(body.toolConfig).toBeUndefined();
    const parts = body.contents.flatMap((c) => c.parts);
    expect(parts.some((p) => "functionCall" in p || "functionResponse" in p)).toBe(false);
  });

  it("sanitizes nested schemas", () => {
    expect(
      sanitizeGeminiSchema({
        type: "object",
        additionalProperties: false,
        properties: {
          ids: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 3 },
        },
      }),
    ).toEqual({
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, maxItems: 3 } },
    });
  });
});

describe("GeminiOperatorCopilotProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const provider = () =>
    new GeminiOperatorCopilotProvider({ apiKey: "test-key", model: "gemini-test" });

  it("fails closed without an API key (no network call)", async () => {
    const out = await new GeminiOperatorCopilotProvider({ apiKey: null }).completeTurn(request);
    expect(out).toMatchObject({
      type: "failure",
      errorCode: "gemini_api_key_missing",
      success: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to generateContent with the key in a header, not the URL", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "Hello" }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 },
      }),
    );
    const out = await provider().completeTurn(request);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent",
    );
    expect(String(url)).not.toContain("test-key");
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "test-key" });
    expect(out).toMatchObject({
      type: "text",
      text: "Hello",
      provider: "gemini",
      model: "gemini-test",
      inputTokens: 10,
      outputTokens: 3,
      success: true,
    });
  });

  it("parses functionCall parts into tool_calls", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                { functionCall: { name: "get_housekeeping_today", args: { propertyId: "p" } } },
                { functionCall: { name: "get_property_catalog" } },
              ],
            },
          },
        ],
      }),
    );
    const out = await provider().completeTurn(request);
    expect(out.type).toBe("tool_calls");
    if (out.type !== "tool_calls") return;
    expect(out.toolCalls).toEqual([
      { id: "gemini-call-1", name: "get_housekeeping_today", arguments: { propertyId: "p" } },
      { id: "gemini-call-2", name: "get_property_catalog", arguments: {} },
    ]);
  });

  it.each([
    ["HTTP 429", () => jsonResponse({}, 429), "gemini_rate_limited"],
    ["HTTP 500", () => jsonResponse({}, 500), "gemini_http_500"],
    ["HTTP 400", () => jsonResponse({}, 400), "gemini_http_400"],
    ["empty candidates", () => jsonResponse({ candidates: [] }), "gemini_empty_response"],
    [
      "blocked prompt",
      () => jsonResponse({ promptFeedback: { blockReason: "SAFETY" } }),
      "gemini_prompt_blocked",
    ],
    [
      "invalid function call",
      () =>
        jsonResponse({
          candidates: [{ content: { parts: [{ functionCall: { name: 42 } }] } }],
        }),
      "gemini_invalid_function_call",
    ],
    [
      "non-object args",
      () =>
        jsonResponse({
          candidates: [{ content: { parts: [{ functionCall: { name: "x", args: [1] } }] } }],
        }),
      "gemini_invalid_function_call",
    ],
    ["invalid JSON body", () => new Response("<html>", { status: 200 }), "gemini_invalid_json"],
  ])("fails closed on %s", async (_label, makeResponse, errorCode) => {
    fetchMock.mockResolvedValue(makeResponse());
    const out = await provider().completeTurn(request);
    expect(out).toMatchObject({ type: "failure", errorCode, success: false });
  });

  it("fails closed on network errors and aborts", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await provider().completeTurn(request)).toMatchObject({
      type: "failure",
      errorCode: "gemini_unavailable",
    });

    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abort);
    expect(await provider().completeTurn(request)).toMatchObject({
      type: "failure",
      errorCode: "gemini_timeout",
    });
  });
});

describe("createOperatorCopilotProvider", () => {
  it("resolves kinds explicitly and defaults to gemini", () => {
    expect(resolveOperatorCopilotProviderKind(undefined)).toBe("gemini");
    expect(resolveOperatorCopilotProviderKind("")).toBe("gemini");
    expect(resolveOperatorCopilotProviderKind("garbage")).toBe("gemini");
    expect(resolveOperatorCopilotProviderKind("heuristic")).toBe("heuristic");
    expect(resolveOperatorCopilotProviderKind("OFF")).toBe("unavailable");
  });

  it("builds the matching provider and the unavailable provider fails closed", async () => {
    expect(createOperatorCopilotProvider({ kind: "gemini", apiKey: "k" })).toBeInstanceOf(
      GeminiOperatorCopilotProvider,
    );
    const unavailable = createOperatorCopilotProvider({ kind: "unavailable" });
    expect(unavailable).toBeInstanceOf(UnavailableOperatorCopilotProvider);
    expect(await unavailable.completeTurn(request)).toMatchObject({
      type: "failure",
      success: false,
    });
    const heuristic = createOperatorCopilotProvider({ kind: "heuristic" });
    expect(await heuristic.completeTurn({ ...request, toolResults: undefined })).toMatchObject({
      type: "text",
    });
  });
});
