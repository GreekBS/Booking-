import { describe, expect, it } from "vitest";
import {
  HeuristicOperatorCopilotProvider,
  OperatorCopilotOrchestrator,
  OperatorCopilotToolRegistry,
  classifyOperatorCopilotTurnIntent,
  normalizeOperatorCopilotMessage,
  type CopilotConversationRecord,
  type CopilotMessageRecord,
  type IOperatorCopilotProvider,
  type OperatorCopilotProviderOutcome,
  type OperatorCopilotToolDeps,
  type OperatorCopilotTurnRequest,
} from "../../src/operator-copilot";
import { Result } from "../../src/shared/kernel/Result";
import {
  PermissionChecker,
  type ActorContext,
} from "../../src/shared/services/PermissionChecker";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP_A = "22222222-2222-4222-8222-222222222222";
const USER = "44444444-4444-4444-8444-444444444444";

const manager: ActorContext = { userId: USER, role: "manager", propertyIds: [PROP_A] };

describe("classifyOperatorCopilotTurnIntent", () => {
  it.each([
    "γεια",
    "γεια σου",
    "Γεια σου!",
    "καλημέρα",
    "Καλησπέρα",
    "καληνύχτα",
    "hello",
    "Hi!",
    "hey there",
    "good morning",
    "ευχαριστώ",
    "ευχαριστώ πολύ",
    "thanks",
    "thank you",
    "ποια είσαι;",
    "who are you",
    "τι μπορείς να κάνεις;",
    "what can you do",
    "γεια σου talia",
    "hi talia",
  ])("classifies conversational: %s", (message) => {
    expect(classifyOperatorCopilotTurnIntent(message)).toBe("conversational");
  });

  it.each([
    "Πόσες κρατήσεις έχω;",
    "Έχω check-in σήμερα;",
    "Καλημέρα, τι κρατήσεις έχουμε σήμερα;",
    "Τι εκκρεμότητες υπάρχουν;",
    "γεια σου, πόσες αφίξεις έχω;",
    "hello, any bookings today?",
    "thanks — show me housekeeping",
    "what is the occupancy?",
    "status?",
    "σήμερα",
    "how many guests",
    "διαθεσιμότητα παρακαλώ",
    "ok",
    "ναι",
    "βοήθησέ με",
    "tell me more",
    "γεια ".repeat(20),
  ])("keeps tools for operational/ambiguous: %s", (message) => {
    expect(classifyOperatorCopilotTurnIntent(message)).toBe("tools");
  });

  it("strips accents and punctuation consistently", () => {
    expect(normalizeOperatorCopilotMessage("  Καλημέρα!!! ")).toBe("καλημερα");
    expect(normalizeOperatorCopilotMessage("ποια είσαι;")).toBe("ποια εισαι");
  });
});

describe("OperatorCopilotOrchestrator conversational fast path", () => {
  function fakeDeps(): OperatorCopilotToolDeps {
    const unused = { execute: async () => Result.fail(new Error("unused")) };
    return {
      getTenantDashboardOverviewUseCase: unused,
      getHousekeepingTodayUseCase: unused,
      getBookingUseCase: unused,
      searchBookingsUseCase: unused,
      getUnitsCalendarBatchUseCase: unused,
      checkAvailabilityUseCase: unused,
      getConversationThreadUseCase: unused,
      listOpenEscalationsUseCase: unused,
      listTasksUseCase: unused,
      listPropertyUnitCatalogUseCase: unused,
      permissionChecker: new PermissionChecker(),
    } as unknown as OperatorCopilotToolDeps;
  }

  function setup(provider: IOperatorCopilotProvider) {
    const convs = new Map<string, CopilotConversationRecord>();
    const msgs: CopilotMessageRecord[] = [];
    const usage: Array<{
      operation: string;
      success: boolean;
      classification: string | null;
      errorCode: string | null;
    }> = [];
    let n = 0;
    const now = new Date();
    convs.set("c1", {
      id: "c1",
      tenantId: TENANT,
      operatorUserId: USER,
      title: null,
      status: "active",
      activePropertyId: null,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const orchestrator = new OperatorCopilotOrchestrator(
      provider,
      new OperatorCopilotToolRegistry(fakeDeps()),
      {
        create: async (r) => r,
        findById: async (_t, id) => convs.get(id) ?? null,
        listByOperator: async () => [],
        archive: async () => null,
        touch: async (_t, id, patch) => {
          const c = convs.get(id)!;
          const next = { ...c, ...patch } as CopilotConversationRecord;
          convs.set(id, next);
          return next;
        },
      },
      {
        append: async (m) => (msgs.push(m), m),
        listRecentMessages: async (_t, _c, limit) => msgs.slice(-limit),
        listMessages: async () => msgs,
      },
      {
        record: async (r) => (
          usage.push({
            operation: r.operation,
            success: r.success,
            classification: r.classification,
            errorCode: r.errorCode,
          }),
          r
        ),
      },
      { generate: () => `id-${++n}` },
      new PermissionChecker(),
    );
    return { orchestrator, msgs, usage, convs };
  }

  const base = {
    tenantId: TENANT,
    conversationId: "c1",
    operatorUserId: USER,
    actor: manager,
    activePropertyId: PROP_A,
    pageContext: null,
  };

  it("omits tool declarations for Greek greetings and persists history", async () => {
    const seenTools: number[] = [];
    const provider: IOperatorCopilotProvider = {
      async completeTurn(
        req: OperatorCopilotTurnRequest,
      ): Promise<OperatorCopilotProviderOutcome> {
        seenTools.push(req.tools.length);
        expect(req.history.length).toBeGreaterThanOrEqual(0);
        expect(req.operatorRequest).toBe("γεια σου");
        return {
          type: "text",
          text: "Γεια σας! Πώς μπορώ να βοηθήσω;",
          provider: "gemini",
          model: "gemini-3.8-flash",
          inputTokens: 50,
          outputTokens: 20,
          latencyMs: 800,
          success: true,
          httpAttempts: 1,
        };
      },
    };

    const { orchestrator, msgs, usage, convs } = setup(provider);
    const out = (
      await orchestrator.runTurn({ ...base, message: "γεια σου" })
    ).getValue();

    expect(out.failed).toBe(false);
    expect(out.toolCallCount).toBe(0);
    expect(seenTools).toEqual([0]);
    expect(msgs.map((m) => m.role)).toEqual(["operator", "assistant"]);
    expect(convs.get("c1")!.title).toContain("γεια σου");
    expect(usage.map((u) => u.operation)).toEqual([
      "operator_copilot_round",
      "operator_copilot_turn",
    ]);
    expect(usage[1]!.classification).toMatch(/^r1\|h1\|t0\|tm0\|gm/);
  });

  it("keeps tools enabled for mixed greeting + operational question", async () => {
    const seen: number[] = [];
    const provider: IOperatorCopilotProvider = {
      async completeTurn(
        req: OperatorCopilotTurnRequest,
      ): Promise<OperatorCopilotProviderOutcome> {
        seen.push(req.tools.length);
        return {
          type: "text",
          text: "Σήμερα 0 αφίξεις.",
          provider: "gemini",
          model: "gemini-3.8-flash",
          inputTokens: 80,
          outputTokens: 20,
          latencyMs: 500,
          success: true,
          httpAttempts: 1,
        };
      },
    };
    const { orchestrator } = setup(provider);
    const out = (
      await orchestrator.runTurn({
        ...base,
        message: "Καλημέρα, τι κρατήσεις έχουμε σήμερα;",
      })
    ).getValue();
    expect(out.failed).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeGreaterThan(0);
  });

  it("preserves thought signatures on the tool-enabled path after a prior greeting", async () => {
    const msgsSeed: CopilotMessageRecord[] = [];
    let call = 0;
    const provider: IOperatorCopilotProvider = {
      async completeTurn(
        req: OperatorCopilotTurnRequest,
      ): Promise<OperatorCopilotProviderOutcome> {
        call += 1;
        if (call === 1) {
          // Greeting turn — no tools.
          expect(req.tools).toEqual([]);
          return {
            type: "text",
            text: "Γεια!",
            provider: "gemini",
            model: "gemini-3.8-flash",
            inputTokens: 40,
            outputTokens: 5,
            latencyMs: 200,
            success: true,
            httpAttempts: 1,
          };
        }
        if (call === 2) {
          expect(req.tools.length).toBeGreaterThan(0);
          expect(req.history.some((h) => h.content === "γεια σου")).toBe(true);
          return {
            type: "tool_calls",
            toolCalls: [
              {
                id: "fc-hk",
                name: "get_housekeeping_today",
                arguments: {},
                thoughtSignature: "sig-hk",
                providerCallId: "fc-hk",
              },
            ],
            provider: "gemini",
            model: "gemini-3.8-flash",
            inputTokens: 100,
            outputTokens: 10,
            latencyMs: 300,
            success: true,
            httpAttempts: 1,
          };
        }
        expect(req.toolResults?.[0]?.thoughtSignature).toBe("sig-hk");
        expect(req.toolResults?.[0]?.providerCallId).toBe("fc-hk");
        return {
          type: "text",
          text: "Καθαριότητα OK.",
          provider: "gemini",
          model: "gemini-3.8-flash",
          inputTokens: 110,
          outputTokens: 20,
          latencyMs: 250,
          success: true,
          httpAttempts: 1,
        };
      },
    };

    // Housekeeping must succeed for the second turn.
    const executed: string[] = [];
    const unused = { execute: async () => Result.fail(new Error("unused")) };
    const deps = {
      getTenantDashboardOverviewUseCase: unused,
      getHousekeepingTodayUseCase: {
        execute: async (input: { propertyId: string }) => {
          executed.push(input.propertyId);
          return Result.ok({
            propertyId: input.propertyId,
            propertyName: "Villa",
            propertyTimezone: "UTC",
            localToday: "2026-10-08",
            summary: {
              departuresToday: 0,
              dirty: 0,
              inProgress: 0,
              readyForArrivals: 0,
              overdueTasks: 0,
            },
            units: [],
            overdueTasks: [],
          });
        },
      },
      getBookingUseCase: unused,
      searchBookingsUseCase: unused,
      getUnitsCalendarBatchUseCase: unused,
      checkAvailabilityUseCase: unused,
      getConversationThreadUseCase: unused,
      listOpenEscalationsUseCase: unused,
      listTasksUseCase: unused,
      listPropertyUnitCatalogUseCase: unused,
      permissionChecker: new PermissionChecker(),
    } as unknown as OperatorCopilotToolDeps;

    const convs = new Map<string, CopilotConversationRecord>();
    let n = 0;
    const now = new Date();
    convs.set("c1", {
      id: "c1",
      tenantId: TENANT,
      operatorUserId: USER,
      title: null,
      status: "active",
      activePropertyId: null,
      lastMessageAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const orchestrator = new OperatorCopilotOrchestrator(
      provider,
      new OperatorCopilotToolRegistry(deps),
      {
        create: async (r) => r,
        findById: async (_t, id) => convs.get(id) ?? null,
        listByOperator: async () => [],
        archive: async () => null,
        touch: async (_t, id, patch) => {
          const c = convs.get(id)!;
          const next = { ...c, ...patch } as CopilotConversationRecord;
          convs.set(id, next);
          return next;
        },
      },
      {
        append: async (m) => (msgsSeed.push(m), m),
        listRecentMessages: async (_t, _c, limit) => msgsSeed.slice(-limit),
        listMessages: async () => msgsSeed,
      },
      { record: async (r) => r },
      { generate: () => `id-${++n}` },
      new PermissionChecker(),
    );

    const greet = (
      await orchestrator.runTurn({ ...base, message: "γεια σου" })
    ).getValue();
    expect(greet.toolCallCount).toBe(0);

    const ops = (
      await orchestrator.runTurn({
        ...base,
        message: "πώς είναι η καθαριότητα;",
      })
    ).getValue();
    expect(ops.failed).toBe(false);
    expect(ops.toolCallCount).toBe(1);
    expect(executed).toEqual([PROP_A]);
    expect(call).toBe(3);
  });

  it("keeps tools for pure operational questions", async () => {
    const seen: number[] = [];
    const provider: IOperatorCopilotProvider = {
      async completeTurn(
        req: OperatorCopilotTurnRequest,
      ): Promise<OperatorCopilotProviderOutcome> {
        seen.push(req.tools.length);
        return {
          type: "text",
          text: "Δεν υπάρχουν κρατήσεις.",
          provider: "gemini",
          model: "gemini-3.8-flash",
          inputTokens: 90,
          outputTokens: 15,
          latencyMs: 600,
          success: true,
          httpAttempts: 2,
        };
      },
    };
    const { orchestrator } = setup(provider);
    await orchestrator.runTurn({
      ...base,
      message: "Πόσες κρατήσεις έχω;",
    });
    expect(seen[0]).toBeGreaterThan(0);
  });

  it("fail-closes if conversational path unexpectedly returns tool_calls", async () => {
    const provider: IOperatorCopilotProvider = {
      async completeTurn(): Promise<OperatorCopilotProviderOutcome> {
        return {
          type: "tool_calls",
          toolCalls: [{ id: "x", name: "get_today_overview", arguments: {} }],
          provider: "gemini",
          model: "gemini-3.8-flash",
          inputTokens: 10,
          outputTokens: 5,
          latencyMs: 100,
          success: true,
          httpAttempts: 1,
        };
      },
    };
    const { orchestrator, usage } = setup(provider);
    const out = (await orchestrator.runTurn({ ...base, message: "hello" })).getValue();
    expect(out.failed).toBe(true);
    expect(out.errorCode).toBe("unexpected_tool_calls");
    expect(out.toolCallCount).toBe(0);
    expect(usage.at(-1)).toMatchObject({
      operation: "operator_copilot_turn",
      success: false,
      errorCode: "unexpected_tool_calls",
    });
  });

  it("heuristic greeting uses no-tool path and still persists", async () => {
    const { orchestrator, msgs } = setup(new HeuristicOperatorCopilotProvider());
    const out = (await orchestrator.runTurn({ ...base, message: "thanks" })).getValue();
    expect(out.failed).toBe(false);
    expect(out.toolCallCount).toBe(0);
    expect(msgs.map((m) => m.role)).toEqual(["operator", "assistant"]);
  });
});
