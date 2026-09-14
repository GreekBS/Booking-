import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isChannelWebhookApiEnabled } from "@/lib/channels/webhook-api";
import { isChannelInboxReplayApiEnabled } from "@/lib/channels/inbox-replay-api";

const WEB_ROOT = join(process.cwd());
const API_ROOT = join(WEB_ROOT, "app", "api");
const CONTAINER = join(WEB_ROOT, "lib", "di", "container.ts");
const MIGRATIONS = join(WEB_ROOT, "..", "..", "packages", "database", "prisma", "migrations");
const DOCS = join(WEB_ROOT, "..", "..", "docs", "cm-4b-s4a2b-transport-http.md");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("S4a-2b transport HTTP fitness (web)", () => {
  it("feature gates default off and require exact true", () => {
    expect(isChannelWebhookApiEnabled({})).toBe(false);
    expect(isChannelWebhookApiEnabled({ CHANNELS_WEBHOOK_API_ENABLED: "TRUE" })).toBe(false);
    expect(isChannelWebhookApiEnabled({ CHANNELS_WEBHOOK_API_ENABLED: "true" })).toBe(true);
    expect(isChannelInboxReplayApiEnabled({})).toBe(false);
    expect(isChannelInboxReplayApiEnabled({ CHANNELS_INBOX_REPLAY_API_ENABLED: "true" })).toBe(
      true,
    );
  });

  it("exposes webhook, poll, and replay routes with Node runtime", () => {
    const webhook = join(
      API_ROOT,
      "channels",
      "v1",
      "webhooks",
      "[provider]",
      "[tenantId]",
      "[connectionId]",
      "route.ts",
    );
    const poll = join(
      API_ROOT,
      "admin",
      "v1",
      "channel-connections",
      "[connectionId]",
      "poll",
      "route.ts",
    );
    const replay = join(
      API_ROOT,
      "admin",
      "v1",
      "channel-connections",
      "[connectionId]",
      "inbox",
      "[inboxItemId]",
      "replay",
      "route.ts",
    );
    expect(existsSync(webhook)).toBe(true);
    expect(existsSync(poll)).toBe(true);
    expect(existsSync(replay)).toBe(true);
    expect(existsSync(join(API_ROOT, "admin", "v1", "channel-connections", "[connectionId]", "transport-status"))).toBe(
      false,
    );
    for (const file of [webhook, poll, replay]) {
      const source = read(file);
      expect(source).toMatch(/runtime\s*=\s*["']nodejs["']/);
    }
  });

  it("webhook route uses transport UC only and avoids json/text body APIs", () => {
    const webhook = join(
      API_ROOT,
      "channels",
      "v1",
      "webhooks",
      "[provider]",
      "[tenantId]",
      "[connectionId]",
      "route.ts",
    );
    const source = read(webhook);
    expect(source).toMatch(/handleChannelWebhookTransportUseCase/);
    expect(source).toMatch(/readWebhookRawBody/);
    expect(source).not.toMatch(/request\.json\s*\(/);
    expect(source).not.toMatch(/request\.text\s*\(/);
    expect(source).not.toMatch(/requireTenantContext/);
    expect(source).not.toMatch(/Prisma/);
    expect(source).not.toMatch(/PrepareReservation|CreateBooking|Commerce/);
    expect(source).not.toMatch(/channelInboxRepository|processChannelInboxItemUseCase/);
  });

  it("manual poll enqueues and does not call execute-poll", () => {
    const poll = join(
      API_ROOT,
      "admin",
      "v1",
      "channel-connections",
      "[connectionId]",
      "poll",
      "route.ts",
    );
    const source = read(poll);
    expect(source).toMatch(/enqueueChannelConnectionPollUseCase/);
    expect(source).toMatch(/requireTenantContext/);
    expect(source).not.toMatch(/executeChannelPollConnectionUseCase/);
    expect(source).not.toMatch(/Prisma/);
  });

  it("replay route uses ownership-scoped replay UC", () => {
    const replay = join(
      API_ROOT,
      "admin",
      "v1",
      "channel-connections",
      "[connectionId]",
      "inbox",
      "[inboxItemId]",
      "replay",
      "route.ts",
    );
    const source = read(replay);
    expect(source).toMatch(/replayChannelConnectionInboxItemUseCase/);
    expect(source).not.toMatch(/channelInboxRepository/);
  });

  it("DI wires enqueue and connection-scoped replay use cases", () => {
    const source = read(CONTAINER);
    expect(source).toMatch(/new EnqueueChannelConnectionPollUseCase/);
    expect(source).toMatch(/new ReplayChannelConnectionInboxItemUseCase/);
    expect((source.match(/createProductionChannelProviderRegistry/g) ?? []).length).toBeGreaterThan(
      0,
    );
  });

  it("adds no migration and documents S4a-2b", () => {
    const migrations = readdirSync(MIGRATIONS);
    expect(migrations.some((name) => /s4a2b|s4a-2b/i.test(name))).toBe(false);
    expect(existsSync(DOCS)).toBe(true);
    const docs = read(DOCS);
    expect(docs).toMatch(/CHANNELS_WEBHOOK_API_ENABLED/);
    expect(docs).toMatch(/empty/);
    expect(docs).toMatch(/No migration/);
    expect(docs).toMatch(/Authorization/);
    expect(docs).toMatch(/CHANNEL_TRANSPORT_RATE_LIMIT_MAX_BUCKETS/);
    expect(docs).toMatch(/WAF/);
  });

  it("preserves Authorization for verification and bounds the local rate limiter", () => {
    const headers = read(join(WEB_ROOT, "lib", "channels", "webhook-raw-body.ts"));
    expect(headers).toMatch(/cookie/);
    expect(headers).not.toMatch(/lower === "authorization"/);
    expect(headers).not.toMatch(/authorization"\)/);

    const limiter = read(join(WEB_ROOT, "lib", "channels", "channel-transport-rate-limit.ts"));
    expect(limiter).toMatch(/CHANNEL_TRANSPORT_RATE_LIMIT_MAX_BUCKETS\s*=\s*4_096/);
    expect(limiter).toMatch(/wh:global/);
    expect(limiter).not.toMatch(/wh:route:/);
  });

  it("admin transport routes do not import Booking", () => {
    for (const file of collectTsFiles(join(API_ROOT, "admin", "v1", "channel-connections"))) {
      const normalized = file.replace(/\\/g, "/");
      if (!normalized.includes("/poll/") && !normalized.includes("/inbox/")) {
        continue;
      }
      const source = read(file);
      expect(source).not.toMatch(/CreateBooking|PrepareReservation|CommerceSettings/);
    }
  });
});
