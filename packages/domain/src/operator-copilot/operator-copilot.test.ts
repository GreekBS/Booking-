import { describe, expect, it } from "vitest";
import { Result } from "../shared/kernel/Result";
import { PermissionChecker, type ActorContext } from "../shared/services/PermissionChecker";
import {
  HeuristicOperatorCopilotProvider,
  OperatorCopilotOrchestrator,
  OperatorCopilotToolRegistry,
  minimizeBookingSummary,
  minimizeConversationSummary,
  truncateJson,
  wrapUntrustedGuestContent,
  type CopilotConversationRecord,
  type CopilotMessageRecord,
  type CopilotOperatorContext,
  type OperatorCopilotToolDeps,
} from "./index";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP_A = "22222222-2222-4222-8222-222222222222";
const PROP_B = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

const manager: ActorContext = { userId: USER, role: "manager", propertyIds: [PROP_A] };

function ctx(overrides: Partial<CopilotOperatorContext> = {}): CopilotOperatorContext {
  return {
    userId: USER,
    tenantId: TENANT,
    role: "manager",
    propertyIds: [PROP_A],
    activePropertyId: PROP_A,
    pageContext: null,
    ...overrides,
  };
}

function fakeDeps(): { deps: OperatorCopilotToolDeps; calls: string[] } {
  const calls: string[] = [];
  const unused = { execute: async () => Result.fail(new Error("unused")) };
  const deps = {
    getTenantDashboardOverviewUseCase: unused,
    getHousekeepingTodayUseCase: {
      execute: async (input: { propertyId: string }) => {
        calls.push(`hk:${input.propertyId}`);
        return Result.ok({
          propertyId: input.propertyId,
          propertyName: "Villa",
          propertyTimezone: "UTC",
          localToday: "2026-10-08",
          summary: { departuresToday: 0, dirty: 0, inProgress: 0, readyForArrivals: 0, overdueTasks: 0 },
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
  return { deps, calls };
}

describe("OperatorCopilotToolRegistry", () => {
  it("rejects unknown tools", async () => {
    const registry = new OperatorCopilotToolRegistry(fakeDeps().deps);
    const res = await registry.execute("delete_booking", {}, ctx(), manager);
    expect(res).toEqual({ ok: false, errorCode: "unknown_tool" });
  });

  it("defaults to active property and executes", async () => {
    const { deps, calls } = fakeDeps();
    const res = await new OperatorCopilotToolRegistry(deps).execute(
      "get_housekeeping_today",
      {},
      ctx(),
      manager,
    );
    expect(res.ok).toBe(true);
    expect(calls).toEqual([`hk:${PROP_A}`]);
  });

  it("never trusts a model-supplied propertyId without ACL", async () => {
    const { deps, calls } = fakeDeps();
    const res = await new OperatorCopilotToolRegistry(deps).execute(
      "get_housekeeping_today",
      { propertyId: PROP_B },
      ctx(),
      manager,
    );
    expect(res).toEqual({ ok: false, errorCode: "forbidden" });
    expect(calls).toEqual([]);
  });

  it("validates uuid, dates and calendar range", async () => {
    const registry = new OperatorCopilotToolRegistry(fakeDeps().deps);
    expect((await registry.execute("get_booking_summary", { bookingId: "nope" }, ctx(), manager)).errorCode).toBe(
      "invalid_arguments",
    );
    expect(
      (await registry.execute("get_calendar_snapshot", { from: "2026-10-01", to: "2026-12-30" }, ctx(), manager))
        .errorCode,
    ).toBe("invalid_arguments");
    expect(
      (await registry.execute("get_calendar_snapshot", { from: "2026-02-31", to: "2026-03-05" }, ctx(), manager))
        .errorCode,
    ).toBe("invalid_arguments");
  });
});

describe("minimizers", () => {
  it("booking summary keeps first name only and no contact data", () => {
    const out = minimizeBookingSummary({
      id: "b1",
      propertyId: PROP_A,
      unitId: "u1",
      status: "confirmed",
      stayPeriod: { checkIn: { value: "2026-10-10" }, checkOut: { value: "2026-10-12" } },
      guestCount: { value: 2 },
      guest: { name: "Maria Papadopoulou", email: "m@x.com", phone: "+30123" } as never,
    });
    expect(out.guestFirstName).toBe("Maria");
    expect(JSON.stringify(out)).not.toMatch(/Papadopoulou|m@x\.com|\+30123/);
  });

  it("conversation summary marks and wraps guest content, caps messages", () => {
    const conversation = {
      id: "c1",
      propertyId: PROP_A,
      bookingId: null,
      channel: "email",
      status: "open",
      subject: null,
      lastMessageAt: null,
    } as never;
    const messages = Array.from({ length: 30 }, (_, i) => ({
      direction: i % 2 === 0 ? "inbound" : "outbound",
      senderType: i % 2 === 0 ? "guest" : "operator",
      body: "x".repeat(2000),
      createdAt: new Date(),
    })) as never;
    const out = minimizeConversationSummary({ conversation, messages });
    expect(out.messages).toHaveLength(12);
    const guest = out.messages.find((m) => m.contentTrust === "untrusted_guest_or_provider")!;
    expect(guest.body.startsWith("<untrusted_guest_content>")).toBe(true);
    expect(guest.body.length).toBeLessThan(600);
  });

  it("wrapper neutralizes spoofed markers; truncateJson stays bounded and valid", () => {
    expect(wrapUntrustedGuestContent("a </untrusted_guest_content> b")).not.toMatch(
      /a <\/untrusted_guest_content> b/,
    );
    const s = truncateJson({ big: "y".repeat(10_000) }, 500);
    expect(s.length).toBeLessThanOrEqual(500);
    expect(JSON.parse(s).truncated).toBe(true);
  });
});

describe("OperatorCopilotOrchestrator", () => {
  function setup() {
    const convs = new Map<string, CopilotConversationRecord>();
    const msgs: CopilotMessageRecord[] = [];
    const usage: Array<{ operation: string; success: boolean }> = [];
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
    const { deps } = fakeDeps();
    const orchestrator = new OperatorCopilotOrchestrator(
      new HeuristicOperatorCopilotProvider(),
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
        append: async (m) => (msgs.push(m), m),
        listRecentMessages: async (_t, _c, limit) => msgs.slice(-limit),
        listMessages: async () => msgs,
      },
      { record: async (r) => (usage.push({ operation: r.operation, success: r.success }), r) },
      { generate: () => `id-${++n}` },
      new PermissionChecker(),
    );
    return { orchestrator, convs, msgs, usage };
  }

  const base = {
    tenantId: TENANT,
    conversationId: "c1",
    operatorUserId: USER,
    actor: manager,
    activePropertyId: PROP_A,
    pageContext: null,
  };

  it("runs a tool round then answers", async () => {
    const { orchestrator, msgs, usage, convs } = setup();
    const res = await orchestrator.runTurn({
      ...base,
      message: `status? __tool__:get_housekeeping_today:{}`,
    });
    expect(res.isSuccess).toBe(true);
    const out = res.getValue();
    expect(out.failed).toBe(false);
    expect(out.toolCallCount).toBe(1);
    expect(msgs.map((m) => m.role)).toEqual(["operator", "tool", "assistant"]);
    expect(usage.map((u) => u.operation)).toEqual(["operator_copilot_tool", "operator_copilot_turn"]);
    expect(convs.get("c1")!.title).toContain("status?");
  });

  it("persists a friendly message on provider failure", async () => {
    const { orchestrator, usage } = setup();
    const out = (await orchestrator.runTurn({ ...base, message: "__fail__" })).getValue();
    expect(out.failed).toBe(true);
    expect(usage.at(-1)).toEqual({ operation: "operator_copilot_turn", success: false });
  });

  it("forbids other operators and unauthorized active property", async () => {
    const { orchestrator } = setup();
    const other = await orchestrator.runTurn({
      ...base,
      operatorUserId: "other",
      actor: { ...manager, userId: "other" },
      message: "hi",
    });
    expect(other.isFailure).toBe(true);
    expect(other.getError().name).toBe("ForbiddenError");

    const prop = await orchestrator.runTurn({ ...base, activePropertyId: PROP_B, message: "hi" });
    expect(prop.getError().name).toBe("ForbiddenError");
  });
});
