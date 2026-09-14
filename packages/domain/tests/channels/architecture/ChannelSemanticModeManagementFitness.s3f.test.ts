import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DOMAIN_ROOT = join(process.cwd());
const CHANNELS_SRC = join(DOMAIN_ROOT, "src", "channels");
const WEB_ROOT = join(DOMAIN_ROOT, "..", "..", "apps", "web");
const WEB_LIB_ROOT = join(WEB_ROOT, "lib");
const WEB_APP_ROOT = join(WEB_ROOT, "app");
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
      if (entry === "node_modules" || entry === ".next") {
        continue;
      }
      files.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("CM-4b S3f architecture fitness", () => {
  const routePath = join(
    WEB_APP_ROOT,
    "api",
    "admin",
    "v1",
    "channel-connections",
    "[connectionId]",
    "semantic-mode",
    "route.ts",
  );

  it("GET route depends on GetChannelConnectionSemanticConfigurationUseCase", () => {
    expect(existsSync(routePath)).toBe(true);
    const source = read(routePath);
    expect(source).toMatch(/getChannelConnectionSemanticConfigurationUseCase/);
    expect(source).toMatch(/export async function GET/);
  });

  it("PUT route depends on SetChannelConnectionSemanticModeUseCase", () => {
    const source = read(routePath);
    expect(source).toMatch(/setChannelConnectionSemanticModeUseCase/);
    expect(source).toMatch(/export async function PUT/);
  });

  it("route modules do not import transition store, cursor, or semantic persist repos", () => {
    const source = read(routePath);
    expect(source).not.toMatch(/PrismaChannelSemanticModeTransitionStore/);
    expect(source).not.toMatch(/IChannelSemanticModeTransitionStore/);
    expect(source).not.toMatch(/ChannelPollCursor/);
    expect(source).not.toMatch(/persistSemanticState/);
    expect(source).not.toMatch(/from "@hcp\/database"/);
  });

  it("exactly one production semantic mutation use case exists", () => {
    const applicationDir = join(CHANNELS_SRC, "application");
    const mutationFiles = readdirSync(applicationDir).filter(
      (name) =>
        /SemanticMode/i.test(name) &&
        /UseCase\.ts$/.test(name) &&
        !name.startsWith("Get"),
    );
    expect(mutationFiles).toEqual(["SetChannelConnectionSemanticModeUseCase.ts"]);
  });

  it("expectedSemanticConfigVersion is mandatory on the application command", () => {
    const source = read(
      join(CHANNELS_SRC, "application", "SetChannelConnectionSemanticModeUseCase.ts"),
    );
    expect(source).toMatch(/expectedSemanticConfigVersion: number;/);
    expect(source).not.toMatch(/expectedSemanticConfigVersion\?:/);
    expect(source).toMatch(/parseSemanticConfigVersion/);
  });

  it("fingerprint version remains cm4b-s3d-fingerprint-v1", () => {
    const fingerprint = read(
      join(CHANNELS_SRC, "application", "semanticModeTransitionFingerprint.ts"),
    );
    expect(fingerprint).toMatch(/cm4b-s3d-fingerprint-v1/);
    expect(fingerprint).not.toMatch(/cm4b-s3f-fingerprint/);
  });

  it("production DI wires one mutation path through Prisma store", () => {
    const container = join(WEB_LIB_ROOT, "di", "container.ts");
    expect(existsSync(container)).toBe(true);
    const source = read(container);
    const setModeCount = (source.match(/new SetChannelConnectionSemanticModeUseCase/g) ?? [])
      .length;
    const storeCount = (source.match(/new PrismaChannelSemanticModeTransitionStore/g) ?? [])
      .length;
    expect(setModeCount).toBe(1);
    expect(storeCount).toBe(1);
    expect(source).toMatch(/GetChannelConnectionSemanticConfigurationUseCase/);
    // Activate/Resume DI belongs to S4a-1 operator foundation (not S3f).
  });

  it("feature gate defaults disabled and returns NotFound when off", () => {
    const gate = read(join(WEB_LIB_ROOT, "channels", "semantic-mode-api.ts"));
    expect(gate).toMatch(/CHANNELS_SEMANTIC_MODE_API_ENABLED === "true"/);
    const route = read(routePath);
    expect(route).toMatch(/assertSemanticModeApiEnabled/);
    expect(route).toMatch(/NotFoundError/);
  });

  it("API error handler maps IDEMPOTENCY_CONFLICT to 409", () => {
    const handler = read(join(WEB_LIB_ROOT, "api-error-handler.ts"));
    expect(handler).toMatch(/IDEMPOTENCY_CONFLICT:\s*409/);
  });

  it("HTTP schema requires commandId, expected version, and confirmation", () => {
    const validators = join(DOMAIN_ROOT, "..", "validators", "src", "admin.ts");
    const source = read(validators);
    expect(source).toMatch(/setChannelConnectionSemanticModeSchema/);
    expect(source).toMatch(/commandId: z\.string\(\)/);
    expect(source).toMatch(/expectedSemanticConfigVersion: z\.number\(\)\.int\(\)\.positive\(\)/);
    expect(source).toMatch(/confirmed: z\.literal\(true\)/);
    expect(source).toMatch(/\.strict\(\)/);
  });

  it("adds no semantic-management UI pages", () => {
    if (!existsSync(WEB_APP_ROOT)) {
      return;
    }
    const uiHits: string[] = [];
    for (const file of collectTsFiles(WEB_APP_ROOT)) {
      if (file.includes(`${join("api", "admin")}`)) {
        continue;
      }
      const source = read(file);
      if (
        /semantic-mode|SetChannelConnectionSemanticMode|GetChannelConnectionSemanticConfiguration/.test(
          source,
        )
      ) {
        uiHits.push(file);
      }
    }
    expect(uiHits).toEqual([]);
  });

  it("S3f semantic-mode route does not import activate/resume use cases", () => {
    const source = read(routePath);
    expect(source).not.toMatch(/ActivateChannelConnectionUseCase/);
    expect(source).not.toMatch(/ResumeChannelConnectionUseCase/);
    expect(source).not.toMatch(/activateChannelConnectionUseCase/);
    expect(source).not.toMatch(/resumeChannelConnectionUseCase/);
  });

  it("adds no migration for S3f", () => {
    expect(existsSync(join(DOCS_ROOT, "cm-4b-s3f-production-semantic-management.md"))).toBe(
      true,
    );
    if (!existsSync(MIGRATIONS_DIR)) {
      return;
    }
    const migrations = readdirSync(MIGRATIONS_DIR);
    expect(migrations.some((name) => /s3f|semantic.?mode.?api|semantic.?manag/i.test(name))).toBe(
      false,
    );
  });

  it("route and docs do not introduce polling, Inbox replay, emission, or Booking creation", () => {
    const route = read(routePath);
    expect(route).not.toMatch(/PollChannel|ReplayChannelInbox|PrepareReservation|CreateBooking/);
    const docs = read(join(DOCS_ROOT, "cm-4b-s3f-production-semantic-management.md"));
    expect(docs).toMatch(/Inbox replay/i);
    expect(docs).toMatch(/Booking creation/i);
  });
});
