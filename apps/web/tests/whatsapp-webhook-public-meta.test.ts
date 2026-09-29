import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

vi.mock("@/lib/di/container", () => ({
  activateWhatsAppFromContactTokenUseCase: { execute: vi.fn() },
  conversationRepository: { updateMeta: vi.fn() },
  ingestGuestMessageUseCase: { execute: vi.fn() },
  loadPropertyAmenities: vi.fn(),
  messagingUnmatchedInboundRepository: {
    findByExternalMessageId: vi.fn(),
    create: vi.fn(),
  },
  platformMessagingConnectionRepository: {
    findByPhoneNumberId: vi.fn(),
  },
  routeWhatsAppInboundUseCase: { execute: vi.fn() },
}));

vi.mock("@/lib/logging/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { GET } from "../app/api/messaging/v1/webhooks/whatsapp/route";

describe("WhatsApp webhook public Meta surface", () => {
  it("middleware exempts only the exact WhatsApp webhook path (not /api/messaging/*)", () => {
    const source = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
    expect(source).toContain(
      'url.pathname === "/api/messaging/v1/webhooks/whatsapp"',
    );
    expect(source).toContain("isPublicWhatsAppWebhook");
    expect(source).not.toContain(
      'url.pathname.startsWith("/api/messaging/")',
    );
    expect(source).toContain('code: "UNAUTHORIZED"');
    expect(source).toContain("status: 401");
  });

  it("other protected Talos admin APIs are not exempted by middleware", () => {
    const source = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
    expect(source).not.toContain(
      'url.pathname.startsWith("/api/admin/")',
    );
    expect(source).not.toContain(
      'url.pathname === "/api/admin/v1/bookings"',
    );
    expect(source).toContain("!session?.user");
    expect(source).toContain("isPublicWhatsAppWebhook");
  });

  it("webhook POST still requires HMAC verification in the route", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "app/api/messaging/v1/webhooks/whatsapp/route.ts",
      ),
      "utf8",
    );
    expect(source).toContain("x-hub-signature-256");
    expect(source).toContain("verifySignature");
    expect(source).toContain("MESSAGING_WHATSAPP_APP_SECRET");
    expect(source).toContain("status: 401");
  });
});

describe("WhatsApp webhook GET verification (no Talos session)", () => {
  const PREV = {
    enabled: process.env.MESSAGING_WHATSAPP_WEBHOOK_ENABLED,
    verify: process.env.MESSAGING_WHATSAPP_VERIFY_TOKEN,
    verifyAlt: process.env.META_WHATSAPP_VERIFY_TOKEN,
  };

  beforeEach(() => {
    process.env.MESSAGING_WHATSAPP_WEBHOOK_ENABLED = "true";
    process.env.MESSAGING_WHATSAPP_VERIFY_TOKEN = "talos-meta-verify-test-token";
    delete process.env.META_WHATSAPP_VERIFY_TOKEN;
  });

  afterEach(() => {
    if (PREV.enabled === undefined) {
      delete process.env.MESSAGING_WHATSAPP_WEBHOOK_ENABLED;
    } else {
      process.env.MESSAGING_WHATSAPP_WEBHOOK_ENABLED = PREV.enabled;
    }
    if (PREV.verify === undefined) {
      delete process.env.MESSAGING_WHATSAPP_VERIFY_TOKEN;
    } else {
      process.env.MESSAGING_WHATSAPP_VERIFY_TOKEN = PREV.verify;
    }
    if (PREV.verifyAlt === undefined) {
      delete process.env.META_WHATSAPP_VERIFY_TOKEN;
    } else {
      process.env.META_WHATSAPP_VERIFY_TOKEN = PREV.verifyAlt;
    }
  });

  it("returns hub.challenge when verify_token matches (no session cookie)", async () => {
    const request = new NextRequest(
      "https://talos-jade.vercel.app/api/messaging/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=talos-meta-verify-test-token&hub.challenge=meta-challenge-123",
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("meta-challenge-123");
  });

  it("rejects incorrect verify_token without returning the challenge", async () => {
    const request = new NextRequest(
      "https://talos-jade.vercel.app/api/messaging/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=meta-challenge-123",
    );
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("meta-challenge-123");
  });

  it("does not treat other messaging paths as public via startsWith", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "middleware.ts"),
      "utf8",
    );
    expect(middleware).toContain(
      'url.pathname === "/api/messaging/v1/webhooks/whatsapp"',
    );
    expect(middleware).not.toMatch(
      /pathname\.startsWith\(["']\/api\/messaging/,
    );
  });
});
