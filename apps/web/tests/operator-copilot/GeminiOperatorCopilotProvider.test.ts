import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperatorCopilotTurnRequest } from "@hcp/domain";
import {
  GeminiOperatorCopilotProvider,
  buildGeminiOperatorCopilotRequest,
  parseGeminiOperatorCopilotResponse,
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
      providerCallId: "call-hk-1",
      thoughtSignature: "sig-hk-1",
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

    // Historical tools are text (no fabricated thought signatures).
    // Current-turn toolResults: one model functionCall turn + one user functionResponse turn.
    expect(body.contents.map((c) => c.role)).toEqual([
      "user", // earlier question
      "model", // earlier answer
      "user", // historical tool as text
      "model", // answer after tool
      "user", // current operator request
      "model", // this-turn functionCall(s)
      "user", // this-turn functionResponse(s)
    ]);

    const declarations = body.tools![0]!.functionDeclarations;
    expect(declarations.map((d) => d.name)).toEqual([
      "get_housekeeping_today",
      "get_property_catalog",
    ]);
    expect(JSON.stringify(declarations[0]!.parameters)).not.toMatch(
      /additionalProperties|pattern|uuid/,
    );
    expect(declarations[1]!.parameters).toBeUndefined();
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: "AUTO" } });
  });

  it("preserves thoughtSignature, provider call id and args on the tool round-trip", () => {
    const body = buildGeminiOperatorCopilotRequest(request);
    const thisTurnModel = body.contents[body.contents.length - 2]!;
    const thisTurnUser = body.contents[body.contents.length - 1]!;
    expect(thisTurnModel.role).toBe("model");
    expect(thisTurnUser.role).toBe("user");

    const callPart = thisTurnModel.parts[0] as {
      functionCall: { name: string; args: Record<string, unknown>; id?: string };
      thoughtSignature?: string;
    };
    const responsePart = thisTurnUser.parts[0] as {
      functionResponse: {
        name: string;
        response: Record<string, unknown>;
        id?: string;
      };
    };

    expect(callPart.functionCall).toEqual({
      name: "get_housekeeping_today",
      args: { propertyId: "p1" },
      id: "call-hk-1",
    });
    expect(callPart.thoughtSignature).toBe("sig-hk-1");
    expect(responsePart.functionResponse).toEqual({
      name: "get_housekeeping_today",
      response: { ok: true, data: {} },
      id: "call-hk-1",
    });
  });

  it("does not invent ids or thoughtSignatures when the provider omitted them", () => {
    const body = buildGeminiOperatorCopilotRequest({
      ...request,
      toolResults: [
        {
          toolCallId: "local-only",
          name: "get_today_overview",
          content: '{"ok":true}',
          arguments: {},
        },
      ],
    });
    const modelParts = body.contents[body.contents.length - 2]!.parts;
    const userParts = body.contents[body.contents.length - 1]!.parts;
    const callPart = modelParts[0] as {
      functionCall: Record<string, unknown>;
      thoughtSignature?: string;
    };
    const responsePart = userParts[0] as {
      functionResponse: Record<string, unknown>;
    };
    expect(callPart.functionCall).toEqual({
      name: "get_today_overview",
      args: {},
    });
    expect(callPart.thoughtSignature).toBeUndefined();
    expect(responsePart.functionResponse).toEqual({
      name: "get_today_overview",
      response: { ok: true },
    });
  });

  it("batches multiple parallel toolResults into one model turn and one user turn", () => {
    const body = buildGeminiOperatorCopilotRequest({
      ...request,
      toolResults: [
        {
          toolCallId: "t1",
          name: "get_today_overview",
          content: '{"ok":true,"data":{"arrivalsToday":2}}',
          arguments: { propertyId: "p1" },
          providerCallId: "call-1",
          thoughtSignature: "sig-A",
        },
        {
          toolCallId: "t2",
          name: "get_housekeeping_today",
          content: '{"ok":true,"data":{"dirty":1}}',
          arguments: { propertyId: "p1" },
          providerCallId: "call-2",
          // Parallel calls: signature only on the first part (Gemini contract).
        },
      ],
    });

    const modelTurn = body.contents[body.contents.length - 2]!;
    const userTurn = body.contents[body.contents.length - 1]!;
    expect(modelTurn.role).toBe("model");
    expect(userTurn.role).toBe("user");
    expect(modelTurn.parts).toHaveLength(2);
    expect(userTurn.parts).toHaveLength(2);

    const calls = modelTurn.parts.map((p) => p as {
      functionCall: { name: string; args: Record<string, unknown>; id?: string };
      thoughtSignature?: string;
    });
    expect(calls[0]!.functionCall).toEqual({
      name: "get_today_overview",
      args: { propertyId: "p1" },
      id: "call-1",
    });
    expect(calls[0]!.thoughtSignature).toBe("sig-A");
    expect(calls[1]!.functionCall).toEqual({
      name: "get_housekeeping_today",
      args: { propertyId: "p1" },
      id: "call-2",
    });
    expect(calls[1]!.thoughtSignature).toBeUndefined();

    const responses = userTurn.parts.map(
      (p) =>
        (p as { functionResponse: { name: string; id?: string; response: unknown } })
          .functionResponse,
    );
    expect(responses[0]).toEqual({
      name: "get_today_overview",
      id: "call-1",
      response: { ok: true, data: { arrivalsToday: 2 } },
    });
    expect(responses[1]).toEqual({
      name: "get_housekeeping_today",
      id: "call-2",
      response: { ok: true, data: { dirty: 1 } },
    });
  });

  it("renders tool traffic as text and omits tools on the final round", () => {
    const body = buildGeminiOperatorCopilotRequest({ ...request, tools: [] });
    expect(body.tools).toBeUndefined();
    expect(body.toolConfig).toBeUndefined();
    const parts = body.contents.flatMap((c) => c.parts);
    expect(parts.some((p) => "functionCall" in p || "functionResponse" in p)).toBe(false);
  });

  it("keeps earlier conversation history as user/model text turns", () => {
    const body = buildGeminiOperatorCopilotRequest({
      ...request,
      toolResults: undefined,
    });
    expect(body.contents.map((c) => c.role)).toEqual([
      "user",
      "model",
      "user",
      "model",
      "user",
    ]);
    expect(body.contents[0]!.parts[0]).toEqual({ text: "earlier question" });
    expect(body.contents[1]!.parts[0]).toEqual({ text: "earlier answer" });
    expect(
      (body.contents[2]!.parts[0] as { text: string }).text,
    ).toContain("[tool_result get_today_overview]");
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

describe("parseGeminiOperatorCopilotResponse", () => {
  it("preserves provider call ids and thought signatures from functionCall parts", () => {
    const parsed = parseGeminiOperatorCopilotResponse({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  id: "fc-1",
                  name: "get_today_overview",
                  args: { propertyId: "p1" },
                },
                thoughtSignature: "sig-1",
              },
              {
                functionCall: {
                  id: "fc-2",
                  name: "get_housekeeping_today",
                  args: {},
                },
              },
            ],
          },
        },
      ],
    });
    expect(parsed).toEqual({
      kind: "tool_calls",
      toolCalls: [
        {
          id: "fc-1",
          name: "get_today_overview",
          arguments: { propertyId: "p1" },
          thoughtSignature: "sig-1",
          providerCallId: "fc-1",
        },
        {
          id: "fc-2",
          name: "get_housekeeping_today",
          arguments: {},
          providerCallId: "fc-2",
        },
      ],
    });
  });

  it("does not invent a providerCallId when Gemini omits functionCall.id", () => {
    const parsed = parseGeminiOperatorCopilotResponse({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "get_property_catalog", args: {} } }],
          },
        },
      ],
    });
    expect(parsed.kind).toBe("tool_calls");
    if (parsed.kind !== "tool_calls") return;
    expect(parsed.toolCalls[0]!.providerCallId).toBeUndefined();
    expect(parsed.toolCalls[0]!.thoughtSignature).toBeUndefined();
    expect(parsed.toolCalls[0]!.id).toBe("gemini-call-1");
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

  it("parses functionCall parts into tool_calls with ids and signatures", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    id: "hk-1",
                    name: "get_housekeeping_today",
                    args: { propertyId: "p" },
                  },
                  thoughtSignature: "sig-hk",
                },
                {
                  functionCall: { id: "cat-1", name: "get_property_catalog" },
                },
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
      {
        id: "hk-1",
        name: "get_housekeeping_today",
        arguments: { propertyId: "p" },
        thoughtSignature: "sig-hk",
        providerCallId: "hk-1",
      },
      {
        id: "cat-1",
        name: "get_property_catalog",
        arguments: {},
        providerCallId: "cat-1",
      },
    ]);
  });

  it("sends a Gemini-3-compatible functionResponse round-trip body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "Σήμερα υπάρχουν 0 κρατήσεις." }] } }],
      }),
    );

    const roundTrip: OperatorCopilotTurnRequest = {
      systemPolicy: "POLICY",
      operatorRequest: "Πόσες κρατήσεις έχουμε;",
      trustedContextJson: '{"activePropertyId":"p1"}',
      history: [],
      tools: request.tools,
      toolResults: [
        {
          toolCallId: "fc-today",
          name: "get_today_overview",
          content: '{"ok":true,"data":{"counts":{"arrivalsToday":0}}}',
          arguments: {},
          providerCallId: "fc-today",
          thoughtSignature: "sig-today",
        },
      ],
    };

    const out = await provider().completeTurn(roundTrip);
    expect(out).toMatchObject({
      type: "text",
      text: "Σήμερα υπάρχουν 0 κρατήσεις.",
      success: true,
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    const modelTurn = body.contents[body.contents.length - 2];
    const userTurn = body.contents[body.contents.length - 1];
    expect(modelTurn.role).toBe("model");
    expect(userTurn.role).toBe("user");
    expect(modelTurn.parts[0]).toEqual({
      functionCall: { name: "get_today_overview", args: {}, id: "fc-today" },
      thoughtSignature: "sig-today",
    });
    expect(userTurn.parts[0]).toEqual({
      functionResponse: {
        name: "get_today_overview",
        id: "fc-today",
        response: { ok: true, data: { counts: { arrivalsToday: 0 } } },
      },
    });
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
