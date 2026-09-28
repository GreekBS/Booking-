import { describe, expect, it, vi, afterEach } from "vitest";
import { GeminiAssistantProvider } from "@/lib/ai/GeminiAssistantProvider";
import {
  createAssistantProvider,
  resolveAssistantProviderKind,
} from "@/lib/ai/createAssistantProvider";
import {
  HeuristicAssistantProvider,
  UnavailableAssistantProvider,
  isAssistantProviderFailureReason,
  buildAssistantContext,
  type PropertyAssistantProfileRecord,
} from "@hcp/domain";

const now = new Date();
const profile: PropertyAssistantProfileRecord = {
  id: "p1",
  tenantId: "t1",
  propertyId: "prop1",
  enabled: true,
  mode: "autopilot",
  tone: "warm",
  formality: "neutral",
  emojiPolicy: "sparing",
  useGuestFirstName: true,
  replyLength: "medium",
  signOff: null,
  preferGuestLanguage: true,
  defaultLocale: "el",
  customVoiceNotes: null,
  createdAt: now,
  updatedAt: now,
};

function ctx() {
  return buildAssistantContext({
    property: {
      id: "prop1",
      name: "Demo",
      type: "villa",
      description: null,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      addressLine: null,
      city: null,
      region: null,
      postalCode: null,
      country: null,
    },
    profile,
    knowledge: null,
    faqs: [],
    amenities: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Pool" }],
    messages: [],
  });
}

describe("createAssistantProvider selection", () => {
  it("defaults to gemini", () => {
    expect(resolveAssistantProviderKind(undefined)).toBe("gemini");
    expect(resolveAssistantProviderKind("gemini")).toBe("gemini");
  });

  it("selects heuristic only when explicitly configured", () => {
    expect(resolveAssistantProviderKind("heuristic")).toBe("heuristic");
    expect(createAssistantProvider({ kind: "heuristic" })).toBeInstanceOf(
      HeuristicAssistantProvider,
    );
  });

  it("selects unavailable explicitly", () => {
    expect(createAssistantProvider({ kind: "unavailable" })).toBeInstanceOf(
      UnavailableAssistantProvider,
    );
  });
});

describe("GeminiAssistantProvider fail-closed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("missing API key does not call heuristic and returns failure", async () => {
    const provider = new GeminiAssistantProvider({ apiKey: null });
    const result = await provider.generate({
      context: ctx(),
      inboundMessage: "Do you have a pool?",
      operation: "classify_and_draft",
    });
    expect(result.success).toBe(false);
    expect(result.replyText).toBeNull();
    expect(result.provider).toBe("gemini");
    expect(result.errorCode).toBe("gemini_api_key_missing");
    expect(isAssistantProviderFailureReason(result.escalationReason)).toBe(true);
  });

  it("HTTP 5xx fails closed without fabricating an answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("err", { status: 503 })),
    );
    const provider = new GeminiAssistantProvider({ apiKey: "test-key" });
    const result = await provider.generate({
      context: ctx(),
      inboundMessage: "Do you have a pool?",
      operation: "classify_and_draft",
    });
    expect(result.success).toBe(false);
    expect(result.replyText).toBeNull();
    expect(result.errorCode).toBe("gemini_http_503");
  });

  it("invalid JSON fails closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [{ content: { parts: [{ text: "not-json" }] } }],
            }),
            { status: 200 },
          ),
      ),
    );
    const provider = new GeminiAssistantProvider({ apiKey: "test-key" });
    const result = await provider.generate({
      context: ctx(),
      inboundMessage: "Do you have a pool?",
      operation: "classify_and_draft",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("gemini_invalid_structured_output");
    expect(result.replyText).toBeNull();
  });

  it("timeout fails closed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        throw err;
      }),
    );
    const provider = new GeminiAssistantProvider({ apiKey: "test-key" });
    const result = await provider.generate({
      context: ctx(),
      inboundMessage: "Hello",
      operation: "classify_and_draft",
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("gemini_timeout");
  });
});
