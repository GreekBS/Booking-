import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DOMAIN_ROOT = join(process.cwd());
const CHANNELS_SRC = join(DOMAIN_ROOT, "src", "channels");
const WEB_LIB_ROOT = join(DOMAIN_ROOT, "..", "..", "apps", "web", "lib");
const DATABASE_SRC = join(DOMAIN_ROOT, "..", "database", "src");
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

describe("CM-4b S3e architecture fitness", () => {
  it("documents status exclusion on the repository port", () => {
    const port = read(join(CHANNELS_SRC, "ports", "IChannelConnectionRepository.ts"));
    expect(port).toMatch(/Physically omits:.*`status`/s);
    expect(port).toMatch(/saveNonSemanticChanges/);
    expect(port).toMatch(/pauseWithExpectedSemanticVersion/);
    expect(port).toMatch(/Only activate\/resume helpers may write `status = active`/);
  });

  it("PostgreSQL and in-memory generic save omit status", () => {
    const pg = read(
      join(DATABASE_SRC, "repositories", "channels", "ChannelConnectionRepository.ts"),
    );
    const memory = read(
      join(CHANNELS_SRC, "repositories", "InMemoryChannelConnectionRepository.ts"),
    );

    const pgSave = pg.slice(
      pg.indexOf("async saveNonSemanticChanges"),
      pg.indexOf("async persistCredentialAttachment") !== -1
        ? pg.indexOf("async persistCredentialAttachment")
        : pg.indexOf("async persistSemanticState"),
    );
    expect(pgSave).not.toMatch(/status:/);
    expect(pgSave).toMatch(/Physically omit status/);

    const memSave = memory.slice(
      memory.indexOf("async saveNonSemanticChanges"),
      memory.indexOf("async persistCredentialAttachment") !== -1
        ? memory.indexOf("async persistCredentialAttachment")
        : memory.indexOf("async persistSemanticState"),
    );
    expect(memSave).not.toMatch(/status:/);
    expect(memSave).toMatch(/Intentionally omits status/);
  });

  it("only activate/resume helpers write active in repositories", () => {
    const pg = read(
      join(DATABASE_SRC, "repositories", "channels", "ChannelConnectionRepository.ts"),
    );
    const memory = read(
      join(CHANNELS_SRC, "repositories", "InMemoryChannelConnectionRepository.ts"),
    );

    for (const source of [pg, memory]) {
      expect(source).toMatch(/nextStatus: "active"/);
      expect(source).toMatch(/assertNeverWritesActive/);
      expect(source).toMatch(/pauseWithExpectedSemanticVersion/);
      expect(source).toMatch(/markErrorWithExpectedSemanticVersion/);
      expect(source).toMatch(/disconnectWithExpectedSemanticVersion/);
    }
  });

  it("S3e use cases do not depend on semantic transition store or cursor repos", () => {
    for (const file of [
      "ActivateChannelConnectionUseCase.ts",
      "ResumeChannelConnectionUseCase.ts",
      "ChannelConnectionLifecycleActivationSupport.ts",
    ]) {
      const source = read(join(CHANNELS_SRC, "application", file));
      expect(source).not.toMatch(/IChannelSemanticModeTransitionStore/);
      expect(source).not.toMatch(/IChannelPollCursorRepository/);
      expect(source).not.toMatch(/SemanticModeTransition/);
      expect(source).not.toMatch(/clearCursor|resetCursor|advanceCursor/);
    }
  });

  it("no production activate/resume path uses saveNonSemanticChanges", () => {
    const activate = read(
      join(CHANNELS_SRC, "application", "ActivateChannelConnectionUseCase.ts"),
    );
    const resume = read(join(CHANNELS_SRC, "application", "ResumeChannelConnectionUseCase.ts"));
    expect(activate).not.toMatch(/saveNonSemanticChanges/);
    expect(resume).not.toMatch(/saveNonSemanticChanges/);
    expect(activate).toMatch(/activateWithExpectedSemanticVersion/);
    expect(resume).toMatch(/resumeWithExpectedSemanticVersion/);
  });

  it("S4a-1 wires S3e activate/resume in production DI (operator foundation)", () => {
    const container = join(WEB_LIB_ROOT, "di", "container.ts");
    if (!existsSync(container)) {
      return;
    }
    const source = read(container);
    expect(source).toMatch(/new ActivateChannelConnectionUseCase/);
    expect(source).toMatch(/new ResumeChannelConnectionUseCase/);
  });

  it("adds no migration for S3e", () => {
    expect(existsSync(join(DOCS_ROOT, "cm-4b-s3e-lifecycle-activation.md"))).toBe(true);
    if (!existsSync(MIGRATIONS_DIR)) {
      return;
    }
    const migrations = readdirSync(MIGRATIONS_DIR);
    expect(migrations.some((name) => /s3e|lifecycle.?activ/i.test(name))).toBe(false);
  });

  it("adds no semantic activation state column references in S3e use cases", () => {
    const activate = read(
      join(CHANNELS_SRC, "application", "ActivateChannelConnectionUseCase.ts"),
    );
    expect(activate).not.toMatch(/semanticActivation|activationState|lifecycleReceipt/);
  });
});
