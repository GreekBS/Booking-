import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ConflictError,
  ForbiddenError,
  IdempotencyConflictError,
  NotFoundError,
  PersistenceCorruptionError,
  Result,
  UnauthorizedError,
  ValidationError,
} from "@hcp/domain";

const requireTenantContext = vi.fn();
const getClientIp = vi.fn(() => "127.0.0.1");
const toPermissionActor = vi.fn((actor: unknown) => actor);
const isChannelSemanticModeApiEnabled = vi.fn(() => true);
const getExecute = vi.fn();
const setExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  getClientIp: (...args: unknown[]) => getClientIp(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/channels/semantic-mode-api", () => ({
  isChannelSemanticModeApiEnabled: (...args: unknown[]) =>
    isChannelSemanticModeApiEnabled(...args),
}));

vi.mock("@/lib/di/container", () => ({
  getChannelConnectionSemanticConfigurationUseCase: {
    execute: (...args: unknown[]) => getExecute(...args),
  },
  setChannelConnectionSemanticModeUseCase: {
    execute: (...args: unknown[]) => setExecute(...args),
  },
}));

import { GET, PUT } from "@/app/api/admin/v1/channel-connections/[connectionId]/semantic-mode/route";

const TENANT_ID = "550e8400-e29b-41d4-a716-446655440900";
const CONNECTION_ID = "550e8400-e29b-41d4-a716-446655440901";
const ACTOR_ID = "550e8400-e29b-41d4-a716-446655440902";

const actor = {
  userId: ACTOR_ID,
  email: "admin@example.com",
  platformRole: null,
  activeTenantId: TENANT_ID,
  tenantId: TENANT_ID,
  role: "admin" as const,
  propertyIds: null,
  isSuperAdmin: false,
};

function getRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/semantic-mode`,
    {
      method: "GET",
      headers: {
        "x-tenant-id": TENANT_ID,
        ...headers,
      },
    },
  );
}

function putRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(
    `http://localhost/api/admin/v1/channel-connections/${CONNECTION_ID}/semantic-mode`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": TENANT_ID,
        ...headers,
      },
      body: JSON.stringify(body),
    },
  );
}

const context = { params: Promise.resolve({ connectionId: CONNECTION_ID }) };

const validPutBody = {
  targetMode: "availability_block_feed",
  expectedSemanticConfigVersion: 1,
  commandId: "cmd-http-1",
  confirmation: {
    confirmed: true,
    acknowledgedFromMode: "mixed_or_unknown_feed",
    acknowledgedToMode: "availability_block_feed",
  },
};

describe("channel-connections semantic-mode HTTP (CM-4b S3f)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantContext.mockResolvedValue(actor);
    isChannelSemanticModeApiEnabled.mockReturnValue(true);
    getClientIp.mockReturnValue("127.0.0.1");
    toPermissionActor.mockImplementation((value) => value);
  });

  describe("feature gate", () => {
    it("follows existing auth behavior when unauthenticated", async () => {
      requireTenantContext.mockRejectedValue(new UnauthorizedError());
      const response = await GET(getRequest(), context);
      expect(response.status).toBe(401);
      expect(getExecute).not.toHaveBeenCalled();
    });

    it("returns 404 when flag absent/false for authenticated callers", async () => {
      isChannelSemanticModeApiEnabled.mockReturnValue(false);
      const getResponse = await GET(getRequest(), context);
      expect(getResponse.status).toBe(404);
      expect(getExecute).not.toHaveBeenCalled();

      const putResponse = await PUT(putRequest(validPutBody), context);
      expect(putResponse.status).toBe(404);
      expect(setExecute).not.toHaveBeenCalled();
    });

    it("operates when flag is true", async () => {
      getExecute.mockResolvedValue(
        Result.ok({
          connectionId: CONNECTION_ID,
          provider: "manual",
          lifecycleStatus: "active",
          semanticMode: "mixed_or_unknown_feed",
          semanticConfigVersion: 1,
          allowedSemanticModes: ["mixed_or_unknown_feed"],
          canDeclareReservationFeed: true,
          connectionUpdatedAt: new Date("2026-07-01T00:00:00.000Z"),
        }),
      );
      const response = await GET(getRequest(), context);
      expect(response.status).toBe(200);
      expect(getExecute).toHaveBeenCalledOnce();
    });
  });

  describe("GET", () => {
    it("returns success payload with ISO connectionUpdatedAt", async () => {
      getExecute.mockResolvedValue(
        Result.ok({
          connectionId: CONNECTION_ID,
          provider: "manual",
          lifecycleStatus: "paused",
          semanticMode: "reservation_feed",
          semanticConfigVersion: 3,
          allowedSemanticModes: ["mixed_or_unknown_feed", "reservation_feed"],
          canDeclareReservationFeed: false,
          connectionUpdatedAt: new Date("2026-07-19T10:11:12.000Z"),
        }),
      );
      const response = await GET(getRequest(), context);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        connectionId: CONNECTION_ID,
        provider: "manual",
        lifecycleStatus: "paused",
        semanticMode: "reservation_feed",
        semanticConfigVersion: 3,
        allowedSemanticModes: ["mixed_or_unknown_feed", "reservation_feed"],
        canDeclareReservationFeed: false,
        connectionUpdatedAt: "2026-07-19T10:11:12.000Z",
      });
    });

    it("maps Forbidden and NotFound", async () => {
      getExecute.mockResolvedValueOnce(Result.fail(new ForbiddenError()));
      expect((await GET(getRequest(), context)).status).toBe(403);

      getExecute.mockResolvedValueOnce(Result.fail(new NotFoundError("ChannelConnection", "x")));
      expect((await GET(getRequest(), context)).status).toBe(404);
    });

    it("maps provider validation failures to 400", async () => {
      getExecute.mockResolvedValue(
        Result.fail(new ValidationError("Provider registration not found: manual")),
      );
      expect((await GET(getRequest(), context)).status).toBe(400);
    });
  });

  describe("PUT validation", () => {
    it("rejects missing/empty commandId", async () => {
      const missing = { ...validPutBody } as Record<string, unknown>;
      delete missing.commandId;
      expect((await PUT(putRequest(missing), context)).status).toBe(400);

      expect(
        (await PUT(putRequest({ ...validPutBody, commandId: "   " }), context)).status,
      ).toBe(400);
      expect(setExecute).not.toHaveBeenCalled();
    });

    it("rejects missing/invalid expectedSemanticConfigVersion", async () => {
      const missing = { ...validPutBody } as Record<string, unknown>;
      delete missing.expectedSemanticConfigVersion;
      expect((await PUT(putRequest(missing), context)).status).toBe(400);

      for (const version of [0, -1, 1.5, "1"]) {
        expect(
          (
            await PUT(
              putRequest({ ...validPutBody, expectedSemanticConfigVersion: version }),
              context,
            )
          ).status,
        ).toBe(400);
      }
      expect(setExecute).not.toHaveBeenCalled();
    });

    it("rejects invalid target mode and confirmation", async () => {
      expect(
        (
          await PUT(putRequest({ ...validPutBody, targetMode: "not_a_mode" }), context)
        ).status,
      ).toBe(400);
      expect(
        (
          await PUT(
            putRequest({
              ...validPutBody,
              confirmation: {
                confirmed: false,
                acknowledgedFromMode: "mixed_or_unknown_feed",
                acknowledgedToMode: "availability_block_feed",
              },
            }),
            context,
          )
        ).status,
      ).toBe(400);
      expect(setExecute).not.toHaveBeenCalled();
    });

    it("rejects excessive reason length", async () => {
      expect(
        (
          await PUT(
            putRequest({ ...validPutBody, reason: "x".repeat(501) }),
            context,
          )
        ).status,
      ).toBe(400);
      expect(setExecute).not.toHaveBeenCalled();
    });

    it("rejects body tenantId via strict schema", async () => {
      expect(
        (
          await PUT(putRequest({ ...validPutBody, tenantId: TENANT_ID }), context)
        ).status,
      ).toBe(400);
      expect(setExecute).not.toHaveBeenCalled();
    });

    it("accepts matching Idempotency-Key and rejects mismatch before use case", async () => {
      setExecute.mockResolvedValue(
        Result.ok({
          connectionId: CONNECTION_ID,
          previousMode: "mixed_or_unknown_feed",
          newMode: "availability_block_feed",
          previousSemanticConfigVersion: 1,
          newSemanticConfigVersion: 2,
          changed: true,
          cursorReset: true,
          commandId: validPutBody.commandId,
          replayed: false,
        }),
      );

      const ok = await PUT(
        putRequest(validPutBody, { "Idempotency-Key": validPutBody.commandId }),
        context,
      );
      expect(ok.status).toBe(200);
      expect(setExecute).toHaveBeenCalledOnce();

      setExecute.mockClear();
      const mismatch = await PUT(
        putRequest(validPutBody, { "Idempotency-Key": "other-id" }),
        context,
      );
      expect(mismatch.status).toBe(400);
      expect(setExecute).not.toHaveBeenCalled();
    });
  });

  describe("PUT outcomes", () => {
    it("returns 200 for first success, no-op, and exact replay", async () => {
      setExecute.mockResolvedValueOnce(
        Result.ok({
          connectionId: CONNECTION_ID,
          previousMode: "mixed_or_unknown_feed",
          newMode: "availability_block_feed",
          previousSemanticConfigVersion: 1,
          newSemanticConfigVersion: 2,
          changed: true,
          cursorReset: true,
          commandId: "a",
          replayed: false,
        }),
      );
      expect((await PUT(putRequest(validPutBody), context)).status).toBe(200);

      setExecute.mockResolvedValueOnce(
        Result.ok({
          connectionId: CONNECTION_ID,
          previousMode: "mixed_or_unknown_feed",
          newMode: "mixed_or_unknown_feed",
          previousSemanticConfigVersion: 1,
          newSemanticConfigVersion: 1,
          changed: false,
          cursorReset: false,
          commandId: "b",
          replayed: false,
        }),
      );
      expect((await PUT(putRequest(validPutBody), context)).status).toBe(200);

      setExecute.mockResolvedValueOnce(
        Result.ok({
          connectionId: CONNECTION_ID,
          previousMode: "mixed_or_unknown_feed",
          newMode: "availability_block_feed",
          previousSemanticConfigVersion: 1,
          newSemanticConfigVersion: 2,
          changed: true,
          cursorReset: true,
          commandId: "c",
          replayed: true,
        }),
      );
      const replay = await PUT(putRequest(validPutBody), context);
      expect(replay.status).toBe(200);
      await expect(replay.json()).resolves.toMatchObject({ replayed: true });
    });

    it("maps conflict classes to 409 and forbidden/not-found/corruption", async () => {
      setExecute.mockResolvedValueOnce(
        Result.fail(new ConflictError("stale", "semantic_epoch_conflict")),
      );
      expect((await PUT(putRequest(validPutBody), context)).status).toBe(409);

      setExecute.mockResolvedValueOnce(
        Result.fail(new ConflictError("pending receipt")),
      );
      expect((await PUT(putRequest(validPutBody), context)).status).toBe(409);

      setExecute.mockResolvedValueOnce(
        Result.fail(new IdempotencyConflictError("fingerprint mismatch")),
      );
      expect((await PUT(putRequest(validPutBody), context)).status).toBe(409);

      setExecute.mockResolvedValueOnce(Result.fail(new ForbiddenError()));
      expect((await PUT(putRequest(validPutBody), context)).status).toBe(403);

      setExecute.mockResolvedValueOnce(
        Result.fail(new NotFoundError("ChannelConnection", CONNECTION_ID)),
      );
      expect((await PUT(putRequest(validPutBody), context)).status).toBe(404);

      setExecute.mockResolvedValueOnce(
        Result.fail(new PersistenceCorruptionError("corrupt receipt")),
      );
      expect((await PUT(putRequest(validPutBody), context)).status).toBe(500);
    });
  });
});
