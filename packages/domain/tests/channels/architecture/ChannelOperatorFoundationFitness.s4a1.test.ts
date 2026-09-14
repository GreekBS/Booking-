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

describe("CM-4b S4a-1 architecture fitness", () => {
  it("wires operator use cases, vault, and lifecycle UoW in DI", () => {
    const container = join(WEB_LIB_ROOT, "di", "container.ts");
    expect(existsSync(container)).toBe(true);
    const source = read(container);
    expect(source).toMatch(/new CreateChannelConnectionUseCase/);
    expect(source).toMatch(/new ListChannelConnectionsUseCase/);
    expect(source).toMatch(/new GetChannelConnectionUseCase/);
    expect(source).toMatch(/new UpdateChannelConnectionMetadataUseCase/);
    expect(source).toMatch(/new PutChannelConnectionCredentialsUseCase/);
    expect(source).toMatch(/new PutChannelConnectionWebhookVerificationUseCase/);
    expect(source).toMatch(/new ActivateChannelConnectionUseCase/);
    expect(source).toMatch(/new ResumeChannelConnectionUseCase/);
    expect(source).toMatch(/new PauseChannelConnectionUseCase/);
    expect(source).toMatch(/new DisconnectChannelConnectionUseCase/);
    expect(source).toMatch(/new PrismaChannelCredentialVault/);
    expect(source).toMatch(/new PrismaChannelConnectionLifecycleUnitOfWork/);
  });

  it("does not wire transport HTTP or S4a-2b surfaces in S4a-1 assertions; DI transport wiring is S4a-2a+", () => {
    const container = join(WEB_LIB_ROOT, "di", "container.ts");
    const source = read(container);
    expect((source.match(/new ChannelProviderRegistry/g) ?? []).length).toBe(0);
    expect(source).toMatch(/createProductionChannelProviderRegistry/);
  });

  it("production DI has no deterministic master-key fallback", () => {
    const container = join(WEB_LIB_ROOT, "di", "container.ts");
    const source = read(container);
    expect(source).not.toMatch(/Buffer\.alloc\s*\(\s*32\s*,\s*7\s*\)/);
    expect(source).not.toMatch(/resolveChannelsCredentialsMasterKey/);
    expect(source).not.toMatch(/Buffer\.alloc\s*\(\s*32/);
    expect(source).toMatch(/new PrismaChannelCredentialVault\s*\(\s*\)/);
  });

  it("operator feature gate defaults off", () => {
    const gate = read(join(WEB_LIB_ROOT, "channels", "operator-api.ts"));
    expect(gate).toMatch(/CHANNELS_OPERATOR_API_ENABLED === "true"/);
  });

  it("exposes operator routes; transport HTTP lives in S4a-2b", () => {
    const base = join(WEB_API_ROOT, "admin", "v1", "channel-connections");
    expect(existsSync(join(base, "route.ts"))).toBe(true);
    expect(existsSync(join(base, "[connectionId]", "route.ts"))).toBe(true);
    expect(existsSync(join(base, "[connectionId]", "credentials", "route.ts"))).toBe(true);
    expect(
      existsSync(join(base, "[connectionId]", "webhook-verification", "route.ts")),
    ).toBe(true);
    expect(existsSync(join(base, "[connectionId]", "activate", "route.ts"))).toBe(true);
    expect(existsSync(join(base, "[connectionId]", "pause", "route.ts"))).toBe(true);
    expect(existsSync(join(base, "[connectionId]", "resume", "route.ts"))).toBe(true);
    expect(existsSync(join(base, "[connectionId]", "disconnect", "route.ts"))).toBe(true);
    // S4a-2b added poll/replay; transport-status remains deferred
    expect(existsSync(join(base, "[connectionId]", "transport-status", "route.ts"))).toBe(false);
  });

  it("adds sealed secret migration only", () => {
    expect(existsSync(join(DOCS_ROOT, "cm-4b-s4a1-operator-foundation.md"))).toBe(true);
    const migrations = readdirSync(MIGRATIONS_DIR);
    expect(migrations.some((name) => /s4a1_channel_secrets/i.test(name))).toBe(true);
    const sql = read(
      join(MIGRATIONS_DIR, "20260723120000_cm4b_s4a1_channel_secrets", "migration.sql"),
    );
    expect(sql).toMatch(/channel_secret_records/);
    expect(sql).not.toMatch(/semantic_mode/);
    expect(sql).not.toMatch(/channel_inbox/);
  });

  it("metadata use case never mutates semantics or provider", () => {
    const source = read(
      join(CHANNELS_SRC, "application", "UpdateChannelConnectionMetadataUseCase.ts"),
    );
    expect(source).toMatch(/updateDisplayName/);
    expect(source).toMatch(/saveNonSemanticChanges/);
    expect(source).not.toMatch(/persistSemanticState/);
    expect(source).not.toMatch(/semanticMode\s*=/);
    expect(source).not.toMatch(/provider\s*=/);
  });

  it("credential put never audits raw material", () => {
    const source = read(
      join(CHANNELS_SRC, "application", "PutChannelConnectionCredentialsUseCase.ts"),
    );
    expect(source).toMatch(/hasCredentialRef: true/);
    expect(source).not.toMatch(/metadata:[\s\S]*material/m);
    expect(source).not.toMatch(/apiKey|password|token/i);
  });

  it("fingerprint constant remains v1", () => {
    const fingerprint = read(
      join(CHANNELS_SRC, "application", "semanticModeTransitionFingerprint.ts"),
    );
    expect(fingerprint).toMatch(/cm4b-s3d-fingerprint-v1/);
  });

  it("reservation emission remains disabled", () => {
    const files = collectTsFiles(CHANNELS_SRC);
    const emissionHits = files.filter((file) => {
      const source = read(file);
      return /mayEmitReservationCreate[\s\S]{0,80}true/.test(source);
    });
    expect(emissionHits).toEqual([]);
  });

  it("operator foundation routes do not touch Booking or transport use cases", () => {
    const operatorRoutes = collectTsFiles(
      join(WEB_API_ROOT, "admin", "v1", "channel-connections"),
    ).filter((file) => {
      const normalized = file.replace(/\\/g, "/");
      return (
        !normalized.includes("semantic-mode") &&
        !normalized.includes("/poll/") &&
        !normalized.includes("/inbox/")
      );
    });
    for (const file of operatorRoutes) {
      const source = read(file);
      expect(source).not.toMatch(/PrepareReservation|CreateBooking|BookingRepository/);
      expect(source).not.toMatch(/HandleChannelWebhook|ExecuteChannelPoll|ReplayChannelInbox/);
    }
  });
});
