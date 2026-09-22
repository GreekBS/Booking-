import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DOMAIN_ROOT = join(process.cwd());
const CHANNELS_SRC = join(DOMAIN_ROOT, "src", "channels");
const WEB_ROOT = join(DOMAIN_ROOT, "..", "..", "apps", "web");
const WEB_LIB_ROOT = join(WEB_ROOT, "lib");
const WEB_API_ROOT = join(WEB_ROOT, "app", "api");
const MIGRATIONS_DIR = join(DOMAIN_ROOT, "..", "database", "prisma", "migrations");
const DOCS_ROOT = join(DOMAIN_ROOT, "..", "..", "docs");

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

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("CM-4b S4a-2a architecture fitness", () => {
  it("wires transport composition and gated poll handler in production DI", () => {
    const container = join(WEB_LIB_ROOT, "di", "container.ts");
    expect(existsSync(container)).toBe(true);
    const source = read(container);
    expect(source).toMatch(/createProductionChannelProviderRegistry/);
    expect(source).toMatch(/new ChannelIngressBatchProcessor/);
    expect(source).toMatch(/new ReceiveChannelWebhookBatchUseCase/);
    expect(source).toMatch(/new ReceiveChannelPollBatchUseCase/);
    expect(source).toMatch(/new HandleChannelWebhookTransportUseCase/);
    expect(source).toMatch(/new ExecuteChannelPollConnectionUseCase/);
    expect(source).toMatch(/new PrismaChannelPollCursorRepository/);
    expect(source).toMatch(/new PollChannelConnectionJobHandler/);
    expect(source).toMatch(/PollingFeatureGatedPollJobHandler/);
    expect((source.match(/new PrismaChannelCredentialVault/g) ?? []).length).toBe(1);
    expect((source.match(/new ProcessChannelInboxJobHandler/g) ?? []).length).toBe(1);
    expect((source.match(/new PollChannelConnectionJobHandler/g) ?? []).length).toBe(1);
  });

  it("production factory catalog may include ical only; forbids TestChannel and bypass registration", () => {
    const webLibFiles = collectTsFiles(WEB_LIB_ROOT);
    for (const file of webLibFiles) {
      const source = read(file);
      expect(source).not.toMatch(/createTestChannelTransportProviderRegistration/);
      expect(source).not.toMatch(/createChannelIngressTestStack/);
      expect(source).not.toMatch(/InMemoryChannelCredentialResolver/);
    }
    const factories = read(join(WEB_LIB_ROOT, "channels", "enabled-providers.ts"));
    expect(factories).toMatch(/PRODUCTION_CHANNEL_PROVIDER_FACTORIES/);
    expect(factories).toMatch(/createIcalProviderRegistration/);
    expect(factories).toMatch(/createIcalProviderRegistration\(\{\s*feedFetcher:\s*domainIcalFeedFetcher\s*\}\)/);
    expect(factories).toMatch(/createBookingComProviderRegistration/);
    expect(factories).toMatch(/booking_com:\s*\(\)\s*=>\s*createBookingComProviderRegistration\(\)/);
    expect(factories).not.toMatch(/Object\.freeze\(\{\}\)/);
    expect(factories).not.toMatch(/from ["'].*TestChannel/);
    expect(factories).not.toMatch(/createTestChannel/);
    expect(factories).not.toMatch(/FakeChannel|simulation/);
    // Factory catalog presence must not bypass allow-list bootstrap.
    expect(factories).toMatch(/CHANNELS_ENABLED_PROVIDERS/);
    expect(factories).toMatch(/bootstrapChannelProviderRegistry/);
    expect(factories).not.toMatch(/\.register\s*\(\s*createIcalProviderRegistration/);
    expect(factories).not.toMatch(/\.register\s*\(\s*createBookingComProviderRegistration/);
  });

  it("does not expose transport-status (deferred past S4a-2b)", () => {
    expect(existsSync(join(WEB_API_ROOT, "admin", "v1", "channel-connections", "[connectionId]", "transport-status", "route.ts"))).toBe(
      false,
    );
  });

  it("adds no migration for S4a-2a", () => {
    const migrations = readdirSync(MIGRATIONS_DIR);
    expect(migrations.some((name) => /s4a2a|s4a-2a|s4a2_transport/i.test(name))).toBe(
      false,
    );
  });

  it("documents S4a-2a and keeps fingerprint / emission invariants", () => {
    expect(existsSync(join(DOCS_ROOT, "cm-4b-s4a2a-transport-di-wiring.md"))).toBe(true);
    const fingerprint = read(
      join(CHANNELS_SRC, "application", "semanticModeTransitionFingerprint.ts"),
    );
    expect(fingerprint).toMatch(/cm4b-s3d-fingerprint-v1/);
    const files = collectTsFiles(CHANNELS_SRC);
    const emissionHits = files.filter((file) => {
      const source = read(file);
      return /mayEmitReservationCreate[\s\S]{0,80}true/.test(source);
    });
    expect(emissionHits).toEqual([]);
  });

  it("batch processor still receives via ReceiveChannelEventUseCase only", () => {
    const source = read(
      join(CHANNELS_SRC, "application", "ChannelIngressBatchProcessor.ts"),
    );
    expect(source).toMatch(/ReceiveChannelEventUseCase/);
    expect(source).not.toMatch(/PrepareReservation|CreateBooking|Commerce/);
  });

  it("poll handler still delegates to ExecuteChannelPollConnectionUseCase", () => {
    const source = read(
      join(CHANNELS_SRC, "jobs", "PollChannelConnectionJobHandler.ts"),
    );
    expect(source).toMatch(/ExecuteChannelPollConnectionUseCase/);
  });
});
