import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ForbiddenError,
  NotFoundError,
  Result,
  UnauthorizedError,
  ValidationError,
} from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: any) => ({
  userId: actor.userId,
  role: actor.role,
  propertyIds: actor.propertyIds,
  isSuperAdmin: actor.isSuperAdmin,
}));
const sendExecute = vi.fn();
const getExecute = vi.fn();
const archiveExecute = vi.fn();
const createExecute = vi.fn();
const listExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...(args as [any])),
}));

vi.mock("@/lib/di/container", () => ({
  sendCopilotMessageUseCase: { execute: (...a: unknown[]) => sendExecute(...a) },
  getCopilotConversationUseCase: { execute: (...a: unknown[]) => getExecute(...a) },
  archiveCopilotConversationUseCase: { execute: (...a: unknown[]) => archiveExecute(...a) },
  createCopilotConversationUseCase: { execute: (...a: unknown[]) => createExecute(...a) },
  listCopilotConversationsUseCase: { execute: (...a: unknown[]) => listExecute(...a) },
}));

const CONVERSATION_ID = "99999999-9999-4999-8999-999999999999";
const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROPERTY_ID = "22222222-2222-4222-8222-222222222222";

const actor = {
  userId: "user-session",
  tenantId: "tenant-session",
  role: "manager",
  platformRole: "user",
  propertyIds: [PROPERTY_ID],
  isSuperAdmin: false,
};

const ctx = { params: Promise.resolve({ id: CONVERSATION_ID }) };

function post(body: unknown, headers: Record<string, string> = { "x-tenant-id": "tenant-session" }) {
  return new NextRequest(
    `http://localhost/api/admin/v1/copilot/conversations/${CONVERSATION_ID}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

function turnResult(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-10-08T10:00:00.000Z");
  return {
    conversationId: CONVERSATION_ID,
    operatorMessage: {
      id: "m1",
      tenantId: "tenant-session",
      conversationId: CONVERSATION_ID,
      role: "operator",
      content: "hi",
      toolName: null,
      toolCallId: null,
      createdAt: now,
    },
    assistantMessage: {
      id: "m2",
      tenantId: "tenant-session",
      conversationId: CONVERSATION_ID,
      role: "assistant",
      content: "hello",
      toolName: null,
      toolCallId: null,
      createdAt: now,
    },
    toolMessages: [
      {
        id: "m-tool",
        tenantId: "tenant-session",
        conversationId: CONVERSATION_ID,
        role: "tool",
        content: '{"ok":true,"data":{"secret":"internal"}}',
        toolName: "get_booking_summary",
        toolCallId: "c1",
        createdAt: now,
      },
    ],
    toolCallCount: 1,
    failed: false,
    errorCode: null,
    ...overrides,
  };
}

beforeEach(() => {
  requireTenantContext.mockReset().mockResolvedValue(actor);
  toPermissionActor.mockClear();
  sendExecute.mockReset();
  getExecute.mockReset();
  archiveExecute.mockReset();
  createExecute.mockReset();
  listExecute.mockReset();
});

describe("POST /api/admin/v1/copilot/conversations/[id]/messages", () => {
  it("uses the session actor and ignores client-supplied identity", async () => {
    sendExecute.mockResolvedValue(Result.ok(turnResult()));
    const { POST } = await import(
      "@/app/api/admin/v1/copilot/conversations/[id]/messages/route"
    );

    const response = await POST(
      post({
        content: "  hi  ",
        activePropertyId: PROPERTY_ID,
        pageContext: { kind: "dashboard", propertyId: OTHER_PROPERTY_ID },
        // Hostile extras — must never reach the use case.
        tenantId: "tenant-attacker",
        userId: "user-attacker",
        role: "super_admin",
        operatorUserId: "user-attacker",
      }),
      ctx,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requireTenantContext).toHaveBeenCalledWith("tenant-session");
    expect(sendExecute).toHaveBeenCalledTimes(1);
    const [input, permissionActor] = sendExecute.mock.calls[0]!;
    expect(input).toEqual({
      tenantId: "tenant-session",
      conversationId: CONVERSATION_ID,
      message: "hi",
      activePropertyId: PROPERTY_ID,
      pageContext: { kind: "dashboard", propertyId: OTHER_PROPERTY_ID },
    });
    expect(permissionActor).toEqual({
      userId: "user-session",
      role: "manager",
      propertyIds: [PROPERTY_ID],
      isSuperAdmin: false,
    });

    // Response exposes chat messages only — never tool payloads.
    expect(body.assistantMessage.content).toBe("hello");
    expect(body.operatorMessage.role).toBe("operator");
    expect(body.toolMessages).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("internal");
    expect(JSON.stringify(body)).not.toContain("tenant-session");
  });

  it("rejects unauthenticated requests before touching the use case", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const { POST } = await import(
      "@/app/api/admin/v1/copilot/conversations/[id]/messages/route"
    );
    const response = await POST(post({ content: "hi" }, {}), ctx);
    expect(response.status).toBe(401);
    expect(sendExecute).not.toHaveBeenCalled();
  });

  it("validates the body with Zod", async () => {
    const { POST } = await import(
      "@/app/api/admin/v1/copilot/conversations/[id]/messages/route"
    );
    for (const bad of [
      {},
      { content: "" },
      { content: "   " },
      { content: "x".repeat(4001) },
      { content: "hi", activePropertyId: "not-a-uuid" },
      { content: "hi", pageContext: { kind: "admin" } },
      { content: "hi", pageContext: { kind: "booking", bookingId: "nope" } },
      { content: "hi", pageContext: { kind: "calendar", dateFrom: "yesterday" } },
    ]) {
      const response = await POST(post(bad), ctx);
      expect(response.status, JSON.stringify(bad)).toBe(400);
    }
    const malformed = await POST(post("{not json"), ctx);
    expect(malformed.status).toBe(400);
    expect(sendExecute).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID conversation id", async () => {
    const { POST } = await import(
      "@/app/api/admin/v1/copilot/conversations/[id]/messages/route"
    );
    const response = await POST(post({ content: "hi" }), {
      params: Promise.resolve({ id: "../../etc/passwd" }),
    });
    expect(response.status).toBe(400);
    expect(sendExecute).not.toHaveBeenCalled();
  });

  it("maps ownership failures to 404 and property denials to 403", async () => {
    const { POST } = await import(
      "@/app/api/admin/v1/copilot/conversations/[id]/messages/route"
    );

    sendExecute.mockResolvedValueOnce(
      Result.fail(new NotFoundError("Copilot conversation", CONVERSATION_ID)),
    );
    expect((await POST(post({ content: "hi" }), ctx)).status).toBe(404);

    sendExecute.mockResolvedValueOnce(
      Result.fail(new ForbiddenError("Property access denied")),
    );
    expect(
      (await POST(post({ content: "hi", activePropertyId: OTHER_PROPERTY_ID }), ctx)).status,
    ).toBe(403);

    sendExecute.mockResolvedValueOnce(
      Result.fail(new ValidationError("Conversation is archived")),
    );
    expect((await POST(post({ content: "hi" }), ctx)).status).toBe(400);
  });

  it("passes through a provider-failure turn with its friendly assistant message", async () => {
    sendExecute.mockResolvedValue(
      Result.ok(turnResult({ failed: true, errorCode: "provider_timeout", toolMessages: [] })),
    );
    const { POST } = await import(
      "@/app/api/admin/v1/copilot/conversations/[id]/messages/route"
    );
    const response = await POST(post({ content: "hi" }), ctx);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.failed).toBe(true);
    expect(body.errorCode).toBe("provider_timeout");
  });
});

describe("GET /api/admin/v1/copilot/conversations/[id]", () => {
  it("returns the transcript without tool messages or identity columns", async () => {
    const now = new Date("2026-10-08T10:00:00.000Z");
    getExecute.mockResolvedValue(
      Result.ok({
        conversation: {
          id: CONVERSATION_ID,
          tenantId: "tenant-session",
          operatorUserId: "user-session",
          title: "t",
          status: "active",
          activePropertyId: null,
          lastMessageAt: now,
          createdAt: now,
          updatedAt: now,
        },
        messages: [
          { id: "1", tenantId: "t", conversationId: CONVERSATION_ID, role: "operator", content: "q", toolName: null, toolCallId: null, createdAt: now },
          { id: "2", tenantId: "t", conversationId: CONVERSATION_ID, role: "tool", content: "SECRET", toolName: "x", toolCallId: "c", createdAt: now },
          { id: "3", tenantId: "t", conversationId: CONVERSATION_ID, role: "assistant", content: "a", toolName: null, toolCallId: null, createdAt: now },
        ],
      }),
    );
    const { GET } = await import("@/app/api/admin/v1/copilot/conversations/[id]/route");
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/v1/copilot/conversations/${CONVERSATION_ID}`, {
        headers: { "x-tenant-id": "tenant-session" },
      }),
      ctx,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getExecute).toHaveBeenCalledWith(
      { tenantId: "tenant-session", conversationId: CONVERSATION_ID },
      expect.objectContaining({ userId: "user-session" }),
    );
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["operator", "assistant"]);
    expect(JSON.stringify(body)).not.toContain("SECRET");
    expect(body.conversation.operatorUserId).toBeUndefined();
    expect(body.conversation.tenantId).toBeUndefined();
  });

  it("returns 404 for a conversation owned by another operator", async () => {
    getExecute.mockResolvedValue(Result.fail(new NotFoundError("Copilot conversation", CONVERSATION_ID)));
    const { GET } = await import("@/app/api/admin/v1/copilot/conversations/[id]/route");
    const response = await GET(
      new NextRequest(`http://localhost/api/admin/v1/copilot/conversations/${CONVERSATION_ID}`, {
        headers: { "x-tenant-id": "tenant-session" },
      }),
      ctx,
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/admin/v1/copilot/conversations/[id]/archive", () => {
  it("archives via the session actor", async () => {
    const now = new Date();
    archiveExecute.mockResolvedValue(
      Result.ok({
        id: CONVERSATION_ID,
        tenantId: "tenant-session",
        operatorUserId: "user-session",
        title: null,
        status: "archived",
        activePropertyId: null,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const { POST } = await import(
      "@/app/api/admin/v1/copilot/conversations/[id]/archive/route"
    );
    const response = await POST(
      new NextRequest(
        `http://localhost/api/admin/v1/copilot/conversations/${CONVERSATION_ID}/archive`,
        { method: "POST", headers: { "x-tenant-id": "tenant-session" } },
      ),
      ctx,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).conversation.status).toBe("archived");
    expect(archiveExecute).toHaveBeenCalledWith(
      { tenantId: "tenant-session", conversationId: CONVERSATION_ID },
      expect.objectContaining({ userId: "user-session" }),
    );
  });
});

describe("/api/admin/v1/copilot/conversations", () => {
  it("creates a conversation for the session actor", async () => {
    const now = new Date();
    createExecute.mockResolvedValue(
      Result.ok({
        id: CONVERSATION_ID,
        tenantId: "tenant-session",
        operatorUserId: "user-session",
        title: null,
        status: "active",
        activePropertyId: PROPERTY_ID,
        lastMessageAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const { POST } = await import("@/app/api/admin/v1/copilot/conversations/route");
    const response = await POST(
      new NextRequest("http://localhost/api/admin/v1/copilot/conversations", {
        method: "POST",
        headers: { "content-type": "application/json", "x-tenant-id": "tenant-session" },
        body: JSON.stringify({ activePropertyId: PROPERTY_ID, tenantId: "evil" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(createExecute).toHaveBeenCalledWith(
      { tenantId: "tenant-session", activePropertyId: PROPERTY_ID, title: null },
      expect.objectContaining({ userId: "user-session" }),
    );
  });

  it("lists with a validated status filter", async () => {
    listExecute.mockResolvedValue(Result.ok([]));
    const { GET } = await import("@/app/api/admin/v1/copilot/conversations/route");

    const ok = await GET(
      new NextRequest("http://localhost/api/admin/v1/copilot/conversations?status=active", {
        headers: { "x-tenant-id": "tenant-session" },
      }),
    );
    expect(ok.status).toBe(200);
    expect(listExecute).toHaveBeenCalledWith(
      { tenantId: "tenant-session", status: "active" },
      expect.objectContaining({ userId: "user-session" }),
    );

    const bad = await GET(
      new NextRequest("http://localhost/api/admin/v1/copilot/conversations?status=deleted", {
        headers: { "x-tenant-id": "tenant-session" },
      }),
    );
    expect(bad.status).toBe(400);
  });
});
