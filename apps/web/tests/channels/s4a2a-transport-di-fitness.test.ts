import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const WEB_ROOT = join(process.cwd());
const CONTAINER = join(WEB_ROOT, "lib", "di", "container.ts");
const API_ROOT = join(WEB_ROOT, "app", "api");
const MIGRATIONS_DIR = join(WEB_ROOT, "..", "..", "packages", "database", "prisma", "migrations");
const DOCS = join(WEB_ROOT, "..", "..", "docs", "cm-4b-s4a2a-transport-di-wiring.md");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("S4a-2a transport DI fitness (web)", () => {
  it("wires transport stack, vault-as-resolver, cursor repo, and gated poll handler", () => {
    const source = read(CONTAINER);
    expect(source).toMatch(/createProductionChannelProviderRegistry/);
    expect(source).toMatch(/new PrismaChannelCredentialVault\s*\(\s*\)/);
    expect(source).toMatch(/new PrismaChannelPollCursorRepository/);
    expect(source).toMatch(/new ChannelIngressBatchProcessor/);
    expect(source).toMatch(/new ReceiveChannelWebhookBatchUseCase/);
    expect(source).toMatch(/new ReceiveChannelPollBatchUseCase/);
    expect(source).toMatch(/new HandleChannelWebhookTransportUseCase/);
    expect(source).toMatch(/new ExecuteChannelPollConnectionUseCase/);
    expect(source).toMatch(/new PollChannelConnectionJobHandler/);
    expect(source).toMatch(/new PollingFeatureGatedPollJobHandler/);
    expect(source).toMatch(/channelCredentialVault/);
    expect((source.match(/new PrismaChannelCredentialVault/g) ?? []).length).toBe(1);
    expect((source.match(/new PrismaChannelPollCursorRepository/g) ?? []).length).toBe(1);
    expect(
      (source.match(/channelProviderRegistry = createProductionChannelProviderRegistry/g) ?? [])
        .length,
    ).toBe(1);
    expect((source.match(/new PollChannelConnectionJobHandler/g) ?? []).length).toBe(1);
    expect((source.match(/new ProcessChannelInboxJobHandler/g) ?? []).length).toBe(1);
    expect(source).toMatch(/POLL_CHANNEL_CONNECTION_JOB_TYPE/);
    expect(source).toMatch(/already registered/);
  });

  it("vault is passed as credential resolver to webhook and poll batch use cases", () => {
    const source = read(CONTAINER);
    expect(source).toMatch(
      /ReceiveChannelWebhookBatchUseCase\(\s*[\s\S]*?channelCredentialVault/,
    );
    expect(source).toMatch(
      /ReceiveChannelPollBatchUseCase\(\s*[\s\S]*?channelCredentialVault/,
    );
  });

  it("forbids test providers and Booking/Commerce transport coupling in DI", () => {
    const source = read(CONTAINER);
    expect(source).not.toMatch(/TestChannelWebhook|TestChannelPolling|createTestChannel/);
    expect(source).not.toMatch(/createTestChannelTransportProviderRegistration/);
    expect(source).not.toMatch(/createChannelIngressTestStack/);
    expect(source).not.toMatch(/InMemoryChannelCredentialResolver/);
    // Transport stack must not gain Booking/Commerce deps beyond existing import pipeline wiring
    expect(source).not.toMatch(
      /HandleChannelWebhookTransportUseCase[\s\S]{0,200}PrepareReservation/,
    );
    expect(source).not.toMatch(
      /ExecuteChannelPollConnectionUseCase[\s\S]{0,200}CreateBooking/,
    );
  });

  it("does not add transport-status route (deferred)", () => {
    expect(existsSync(join(API_ROOT, "channels", "v1", "webhooks"))).toBe(true);
    const base = join(API_ROOT, "admin", "v1", "channel-connections");
    expect(existsSync(join(base, "[connectionId]", "poll", "route.ts"))).toBe(true);
    expect(
      existsSync(join(base, "[connectionId]", "transport-status", "route.ts")),
    ).toBe(false);
  });

  it("adds no S4a-2a migration", () => {
    const migrations = readdirSync(MIGRATIONS_DIR);
    expect(migrations.some((name) => /s4a2a/i.test(name))).toBe(false);
    expect(migrations.some((name) => /s4a-2a/i.test(name))).toBe(false);
  });

  it("documents S4a-2a scope", () => {
    expect(existsSync(DOCS)).toBe(true);
    const docs = read(DOCS);
    expect(docs).toMatch(/CHANNELS_ENABLED_PROVIDERS/);
    expect(docs).toMatch(/CHANNELS_POLLING_ENABLED/);
    expect(docs).toMatch(/S4a-2b/);
    expect(docs).toMatch(/empty/);
    expect(docs).toMatch(/no-op/);
  });
});
