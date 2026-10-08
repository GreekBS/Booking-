import { describe, expect, it } from "vitest";
import { Result } from "../../src/shared/kernel/Result";
import {
  PermissionChecker,
  type ActorContext,
} from "../../src/shared/services/PermissionChecker";
import {
  OPERATOR_COPILOT_OPS,
  OperatorCopilotOrchestrator,
  OperatorCopilotToolRegistry,
  buildCopilotRoundClassification,
  buildCopilotTurnClassification,
  isSanitizedCopilotTurnClassification,
  parseCopilotTurnClassification,
  type CopilotConversationRecord,
  type CopilotMessageRecord,
  type IOperatorCopilotProvider,
  type OperatorCopilotProviderOutcome,
  type OperatorCopilotToolDeps,
  type OperatorCopilotTurnRequest,
} from "../../src/operator-copilot";
import type { AiUsageRecord } from "../../src/messaging/domain/MessagingTypes";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP_A = "22222222-2222-4222-8222-222222222222";
const USER = "44444444-4444-4444-8444-444444444444";

const manager: ActorContext = { userId: USER, role: "manager", propertyIds: [PROP_A] };

describe("OperatorCopilotTelemetry encoding", () => {
  it("builds and parses a sanitized turn classification within 32 chars", () => {
    const encoded = buildCopilotTurnClassification({
      geminiRounds: 2,
      httpAttemptsTotal: 3,
      toolCallCount: 1,
      toolLatencyMs: 45,
      geminiLatencyMs: 12_000,
    });
    expect(encoded.length).toBeLessThanOrEqual(32);
    expect(isSanitizedCopilotTurnClassification(encoded)).toBe(true);
    expect(parseCopilotTurnClassification(encoded)).toEqual({
      geminiRounds: 2,
      httpAttemptsTotal: 3,
      toolCallCount: 1,
      toolLatencyMs: 45,
      geminiLatencyMs: 12_000,
    });
  });

  it("never embeds free text / payloads in classifications", () => {
    const turn = buildCopilotTurnClassification({
      geminiRounds: 1,
      httpAttemptsTotal: 1,
      toolCallCount: 0,
      toolLatencyMs: 0,
      geminiLatencyMs: 100,
    });
    const round = buildCopilotRoundClassification(1, 2);
    for (const value of [turn, round]) {
      expect(value).not.toMatch(/@|http|guest|prompt|booking|SELECT/i);
      expect(value).toMatch(/^[a-z0-9|]+$/);
      expect(value.length).toBeLessThanOrEqual(32);
    }
  });

  it("clamps extreme values", () => {
    const encoded = buildCopilotTurnClassification({
      geminiRounds: 99,
      httpAttemptsTotal: 10_000,
      toolCallCount: 50,
      toolLatencyMs: 9_999_999,
      geminiLatencyMs: 9_999_999,
    });
    expect(parseCopilotTurnClassification(encoded)).toEqual({
      geminiRounds: 9,
      httpAttemptsTotal: 99,
      toolCallCount: 9,
      toolLatencyMs: 99_999,
      geminiLatencyMs: 999_999,
    });
  });
});

describe("OperatorCopilotOrchestrator latency observability", () => {
  function fakeDeps(): OperatorCopilotToolDeps {
    const unused = { execute: async () => Result.fail(new Error("unused")) };
    return {
      getTenantDashboardOverviewUseCase: unused,
      getHousekeepingTodayUseCase: {
        execute: async () => {
          await new Promise((r) => setTimeout(r, 5));
          return Result.ok({
            propertyId: PROP_A,
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
  }

  function setup(provider: IOperatorCopilotProvider) {
    const convs = new Map<string, CopilotConversationRecord>();
    const msgs: CopilotMessageRecord[] = [];
    const usage: AiUsageRecord[] = [];
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
      { record: async (r) => (usage.push(r), r) },
      { generate: () => `id-${++n}` },
      new PermissionChecker(),
    );
    return { orchestrator, usage, msgs };
  }

  const base = {
    tenantId: TENANT,
    conversationId: "c1",
    operatorUserId: USER,
    actor: manager,
    activePropertyId: PROP_A,
    pageContext: null,
  };

  it("records wall-clock turn, per-round Gemini, tools, tokens and http attempt sums", async () => {
    let call = 0;
    const provider: IOperatorCopilotProvider = {
      async completeTurn(
        req: OperatorCopilotTurnRequest,
      ): Promise<OperatorCopilotProviderOutcome> {
        call += 1;
        if (call === 1) {
          return {
            type: "tool_calls",
            toolCalls: [
              {
                id: "fc-1",
                name: "get_housekeeping_today",
                arguments: {},
                thoughtSignature: "sig-keep",
                providerCallId: "fc-1",
              },
            ],
            provider: "gemini",
            model: "gemini-3.8-flash",
            inputTokens: 100,
            outputTokens: 20,
            latencyMs: 400,
            success: true,
            httpAttempts: 2,
          };
        }
        expect(req.toolResults?.[0]?.thoughtSignature).toBe("sig-keep");
        expect(req.toolResults?.[0]?.providerCallId).toBe("fc-1");
        return {
          type: "text",
          text: "All clear today.",
          provider: "gemini",
          model: "gemini-3.8-flash",
          inputTokens: 150,
          outputTokens: 30,
          latencyMs: 250,
          success: true,
          httpAttempts: 1,
        };
      },
    };

    const { orchestrator, usage } = setup(provider);
    const out = (await orchestrator.runTurn({ ...base, message: "status?" })).getValue();
    expect(out.failed).toBe(false);
    expect(out.toolCallCount).toBe(1);

    const rounds = usage.filter((u) => u.operation === OPERATOR_COPILOT_OPS.ROUND);
    const tools = usage.filter((u) => u.operation === OPERATOR_COPILOT_OPS.TOOL);
    const turns = usage.filter((u) => u.operation === OPERATOR_COPILOT_OPS.TURN);

    expect(rounds).toHaveLength(2);
    expect(rounds[0]!.classification).toBe("r1|h2");
    expect(rounds[0]!.latencyMs).toBe(400);
    expect(rounds[0]!.inputTokens).toBe(100);
    expect(rounds[1]!.classification).toBe("r2|h1");
    expect(rounds[1]!.latencyMs).toBe(250);

    expect(tools).toHaveLength(1);
    expect(tools[0]!.classification).toBe("get_housekeeping_today");
    expect((tools[0]!.latencyMs ?? 0) >= 0).toBe(true);

    expect(turns).toHaveLength(1);
    const turn = turns[0]!;
    expect(turn.success).toBe(true);
    expect(turn.inputTokens).toBe(250);
    expect(turn.outputTokens).toBe(50);
    // Turn latencyMs is real wall-clock (provider fake latencies are not added).
    expect((turn.latencyMs ?? 0) >= (tools[0]!.latencyMs ?? 0)).toBe(true);
    expect((turn.latencyMs ?? 0) < 400 + 250).toBe(true);

    const parsed = parseCopilotTurnClassification(turn.classification ?? "");
    expect(parsed).toEqual({
      geminiRounds: 2,
      httpAttemptsTotal: 3,
      toolCallCount: 1,
      toolLatencyMs: tools[0]!.latencyMs,
      // Sum of provider-reported round latencies (may exceed wall-clock in tests).
      geminiLatencyMs: 650,
    });

    // Sanitization: no prompt / tool payload content in telemetry strings.
    for (const row of usage) {
      const blob = `${row.classification ?? ""}|${row.errorCode ?? ""}|${row.model}|${row.operation}`;
      expect(blob).not.toMatch(/All clear|status\?|sig-keep|guest@|SELECT/i);
    }
  });

  it("records failed rounds and turn classification without content", async () => {
    const provider: IOperatorCopilotProvider = {
      async completeTurn(): Promise<OperatorCopilotProviderOutcome> {
        return {
          type: "failure",
          errorCode: "gemini_http_503",
          provider: "gemini",
          model: "gemini-3.8-flash",
          latencyMs: 1200,
          success: false,
          httpAttempts: 3,
        };
      },
    };
    const { orchestrator, usage } = setup(provider);
    const out = (await orchestrator.runTurn({ ...base, message: "γεια σου secret@x.com" })).getValue();
    expect(out.failed).toBe(true);

    const round = usage.find((u) => u.operation === OPERATOR_COPILOT_OPS.ROUND)!;
    const turn = usage.find((u) => u.operation === OPERATOR_COPILOT_OPS.TURN)!;
    expect(round.classification).toBe("r1|h3");
    expect(round.success).toBe(false);
    expect(round.errorCode).toBe("gemini_http_503");
    expect(turn.success).toBe(false);
    expect(turn.errorCode).toBe("gemini_http_503");
    expect(parseCopilotTurnClassification(turn.classification ?? "")).toMatchObject({
      geminiRounds: 1,
      httpAttemptsTotal: 3,
      toolCallCount: 0,
      geminiLatencyMs: 1200,
    });
    expect(JSON.stringify(usage)).not.toMatch(/secret@x\.com|γεια/);
  });
});
