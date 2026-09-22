import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DOMAIN_ROOT = join(process.cwd());
const CHANNELS_SRC = join(DOMAIN_ROOT, "src", "channels");
const WEB_API = join(DOMAIN_ROOT, "..", "..", "apps", "web", "app", "api");
const WEB_LIB = join(DOMAIN_ROOT, "..", "..", "apps", "web", "lib");
const MIGRATIONS = join(DOMAIN_ROOT, "..", "database", "prisma", "migrations");
const DOCS = join(DOMAIN_ROOT, "..", "..", "docs");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("CM-4b S4a-2b architecture fitness", () => {
  it("exposes transport HTTP routes; factory catalog may include ical only via allow-list", () => {
    expect(
      existsSync(
        join(
          WEB_API,
          "channels",
          "v1",
          "webhooks",
          "[provider]",
          "[tenantId]",
          "[connectionId]",
          "route.ts",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(join(WEB_API, "admin", "v1", "channel-connections", "[connectionId]", "poll", "route.ts")),
    ).toBe(true);
    expect(
      existsSync(
        join(
          WEB_API,
          "admin",
          "v1",
          "channel-connections",
          "[connectionId]",
          "inbox",
          "[inboxItemId]",
          "replay",
          "route.ts",
        ),
      ),
    ).toBe(true);
    const factories = read(join(WEB_LIB, "channels", "enabled-providers.ts"));
    expect(factories).toMatch(/PRODUCTION_CHANNEL_PROVIDER_FACTORIES/);
    expect(factories).toMatch(/createIcalProviderRegistration\(\{\s*feedFetcher:\s*domainIcalFeedFetcher\s*\}\)/);
    expect(factories).toMatch(/createBookingComProviderRegistration/);
    expect(factories).toMatch(/bootstrapChannelProviderRegistry/);
    expect(factories).not.toMatch(/createTestChannel/);
    expect(factories).not.toMatch(/\.register\s*\(\s*createIcalProviderRegistration/);
    expect(factories).not.toMatch(/\.register\s*\(\s*createBookingComProviderRegistration/);
  });

  it("webhook route stays inbox-first via HandleChannelWebhookTransportUseCase", () => {
    const source = read(
      join(
        WEB_API,
        "channels",
        "v1",
        "webhooks",
        "[provider]",
        "[tenantId]",
        "[connectionId]",
        "route.ts",
      ),
    );
    expect(source).toMatch(/handleChannelWebhookTransportUseCase/);
    expect(source).not.toMatch(/ReceiveChannelEventUseCase/);
    expect(source).not.toMatch(/processChannelInbox|PrepareReservation|CreateBooking/);
  });

  it("fingerprint and emission invariants unchanged", () => {
    expect(read(join(CHANNELS_SRC, "application", "semanticModeTransitionFingerprint.ts"))).toMatch(
      /cm4b-s3d-fingerprint-v1/,
    );
    expect(read(join(CHANNELS_SRC, "types", "ReservationEmissionPolicy.ts"))).toMatch(
      /return false/,
    );
  });

  it("adds no migration and documents slice", () => {
    const migrations = readdirSync(MIGRATIONS);
    expect(migrations.some((name) => /s4a2b|s4a-2b/i.test(name))).toBe(false);
    expect(existsSync(join(DOCS, "cm-4b-s4a2b-transport-http.md"))).toBe(true);
  });

  it("domain adds enqueue and connection-scoped replay use cases", () => {
    expect(
      existsSync(join(CHANNELS_SRC, "application", "EnqueueChannelConnectionPollUseCase.ts")),
    ).toBe(true);
    expect(
      existsSync(join(CHANNELS_SRC, "application", "ReplayChannelConnectionInboxItemUseCase.ts")),
    ).toBe(true);
  });
});
