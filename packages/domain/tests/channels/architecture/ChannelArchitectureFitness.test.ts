import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ALLOWED_TRANSPORT_IMPORT_PATTERNS,
  FORBIDDEN_TRANSPORT_IMPORT_PATTERNS,
  PRODUCTION_DI_FORBIDDEN_IMPORT_PATTERNS,
  PROVIDER_CONTRACT_SRC_SCOPE_RELATIVE_PATHS,
  PROVIDER_HARNESS_SCOPE_RELATIVE_PATHS,
  SEMANTIC_MODE_SCOPE_RELATIVE_PATHS,
  TRANSPORT_SCOPE_RELATIVE_PATHS,
  findDisallowedTransportImports,
  findForbiddenProviderContractSrcImports,
  findForbiddenProviderHarnessImports,
  findForbiddenSemanticModeImports,
  findForbiddenTransportImports,
} from "../../../src/channels/architecture/transportDependencyPolicy";

const DOMAIN_ROOT = join(process.cwd());
const CHANNELS_SRC = join(DOMAIN_ROOT, "src", "channels");
const WEB_LIB_ROOT = join(DOMAIN_ROOT, "..", "..", "apps", "web", "lib");

function collectScopedFiles(relativePaths: readonly string[], root: string = CHANNELS_SRC): string[] {
  const files: string[] = [];

  for (const scopePath of relativePaths) {
    const absolute = join(root, scopePath);
    if (!existsSync(absolute)) {
      continue;
    }

    const stat = statSync(absolute);
    if (stat.isFile() && absolute.endsWith(".ts")) {
      files.push(absolute);
      continue;
    }

    if (stat.isDirectory()) {
      files.push(...collectTsFiles(absolute));
    }
  }

  return files;
}

function collectScopedTransportFiles(): string[] {
  return collectScopedFiles(TRANSPORT_SCOPE_RELATIVE_PATHS);
}

function collectProviderHarnessFiles(): string[] {
  return collectScopedFiles(PROVIDER_HARNESS_SCOPE_RELATIVE_PATHS, DOMAIN_ROOT);
}

function collectProviderContractSrcFiles(): string[] {
  return collectScopedFiles(PROVIDER_CONTRACT_SRC_SCOPE_RELATIVE_PATHS, DOMAIN_ROOT);
}

function collectTsFiles(dir: string): string[] {
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

function collectWebLibProductionFiles(): string[] {
  if (!existsSync(WEB_LIB_ROOT)) {
    return [];
  }
  return collectTsFiles(WEB_LIB_ROOT);
}

describe("Channel transport architecture fitness (CM-4a-5 enforcement)", () => {
  it("defines forbidden and allow-list pattern constants", () => {
    expect(FORBIDDEN_TRANSPORT_IMPORT_PATTERNS.length).toBeGreaterThan(5);
    expect(ALLOWED_TRANSPORT_IMPORT_PATTERNS.length).toBeGreaterThan(5);
    expect(PRODUCTION_DI_FORBIDDEN_IMPORT_PATTERNS.length).toBeGreaterThan(0);
  });

  it("detects forbidden imports in CM-4a-4 poll negative fixture", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "tests", "fixtures", "channels-invalid-poll-forbidden-import.ts"),
      "utf8",
    );
    expect(findForbiddenTransportImports(source).length).toBeGreaterThan(0);
  });

  it("detects forbidden imports in CM-4a-3 webhook negative fixture", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "tests", "fixtures", "channels-invalid-webhook-forbidden-import.ts"),
      "utf8",
    );
    expect(findForbiddenTransportImports(source).length).toBeGreaterThan(0);
  });

  it("detects forbidden imports in negative fixture", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "tests", "fixtures", "channels-invalid-forbidden-import.ts"),
      "utf8",
    );
    expect(findForbiddenTransportImports(source).length).toBeGreaterThan(0);
  });

  it("detects disallowed imports in positive-violation fixture", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "tests", "fixtures", "channels-invalid-disallowed-import.ts"),
      "utf8",
    );
    expect(findDisallowedTransportImports(source).length).toBeGreaterThan(0);
  });

  it("accepts allow-listed imports in positive fixture", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "tests", "fixtures", "channels-valid-transport-import.ts"),
      "utf8",
    );
    expect(findForbiddenTransportImports(source)).toEqual([]);
    expect(findDisallowedTransportImports(source)).toEqual([]);
  });

  it("detects forbidden imports in provider adapter negative fixture", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "tests", "fixtures", "channels-invalid-provider-forbidden-import.ts"),
      "utf8",
    );
    expect(findForbiddenTransportImports(source).length).toBeGreaterThan(0);
  });

  it("lists CM-4a-5 provider harness contract suites", () => {
    const suitesDir = join(DOMAIN_ROOT, "tests", "channels", "contract", "harness", "suites");
    const suiteFiles = readdirSync(suitesDir).filter((entry) => entry.endsWith(".suite.ts"));
    expect(suiteFiles).toEqual(
      expect.arrayContaining([
        "crossTransportRace.suite.ts",
        "identityDedupContract.suite.ts",
        "pollingContract.suite.ts",
        "securityCredentialContract.suite.ts",
        "universalReservationInvariants.suite.ts",
        "utf8RawBodyContract.suite.ts",
        "webhookContract.suite.ts",
      ]),
    );
    expect(suiteFiles.length).toBe(7);
  });

  describe("provider harness scope scans (CM-4a-5)", () => {
    const harnessFiles = collectProviderHarnessFiles();

    it("finds provider harness and fixture files", () => {
      expect(harnessFiles.length).toBeGreaterThanOrEqual(10);
    });

    it.each(harnessFiles)("has no forbidden imports: %s", (filePath) => {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(DOMAIN_ROOT, filePath);
      expect(findForbiddenProviderHarnessImports(source), `${rel} must not match forbidden patterns`).toEqual(
        [],
      );
    });
  });

  describe("provider contract src scans (CM-4a-5)", () => {
    const contractFiles = collectProviderContractSrcFiles();

    it("finds production-safe provider contract type files", () => {
      expect(contractFiles.length).toBeGreaterThanOrEqual(3);
    });

    it.each(contractFiles)("does not depend on harness/test infrastructure: %s", (filePath) => {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(DOMAIN_ROOT, filePath);
      expect(
        findForbiddenProviderContractSrcImports(source),
        `${rel} must not import harness-only code`,
      ).toEqual([]);
    });
  });

  describe("semantic mode scope scans (CM-4b S2)", () => {
    const semanticFiles = collectScopedFiles(SEMANTIC_MODE_SCOPE_RELATIVE_PATHS);

    it("finds semantic mode production files", () => {
      expect(semanticFiles.length).toBeGreaterThanOrEqual(7);
    });

    it.each(semanticFiles)("has no forbidden imports: %s", (filePath) => {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(DOMAIN_ROOT, filePath);
      expect(
        findForbiddenSemanticModeImports(source),
        `${rel} must not match forbidden semantic-mode patterns`,
      ).toEqual([]);
    });
  });

  describe("transport scope scans", () => {
    const scopedFiles = collectScopedTransportFiles();

    it("finds CM-4a-2/CM-4a-3/CM-4a-4 transport production files", () => {
      expect(scopedFiles.length).toBeGreaterThanOrEqual(9);
    });

    it.each(scopedFiles)("has no forbidden imports: %s", (filePath) => {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(DOMAIN_ROOT, filePath);
      expect(findForbiddenTransportImports(source), `${rel} must not match forbidden patterns`).toEqual([]);
    });

    it.each(scopedFiles)("uses only allow-listed imports: %s", (filePath) => {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(DOMAIN_ROOT, filePath);
      expect(findDisallowedTransportImports(source), `${rel} must match allow-list`).toEqual([]);
    });
  });

  describe("production web DI isolation", () => {
    const webLibFiles = collectWebLibProductionFiles();

    it.each(webLibFiles)("does not import test transport infrastructure: %s", (filePath) => {
      const source = readFileSync(filePath, "utf8");
      const rel = relative(DOMAIN_ROOT, filePath);
      for (const pattern of PRODUCTION_DI_FORBIDDEN_IMPORT_PATTERNS) {
        expect(source, `${rel} must not match ${pattern}`).not.toMatch(pattern);
      }
    });

    it("wires CM-4a transport in production DI without test providers (S4a-2a)", () => {
      const containerPath = join(WEB_LIB_ROOT, "di", "container.ts");
      if (!existsSync(containerPath)) {
        return;
      }
      const source = readFileSync(containerPath, "utf8");
      expect(source).toMatch(/ReceiveChannelWebhookBatchUseCase/);
      expect(source).toMatch(/ReceiveChannelPollBatchUseCase/);
      expect(source).toMatch(/HandleChannelWebhookTransportUseCase/);
      expect(source).toMatch(/ExecuteChannelPollConnectionUseCase/);
      expect(source).toMatch(/PollChannelConnectionJobHandler/);
      expect(source).toMatch(/ChannelIngressBatchProcessor/);
      expect(source).toMatch(/createProductionChannelProviderRegistry/);
      expect(source).not.toMatch(/InMemoryChannelCredentialResolver/);
      expect(source).not.toMatch(/createTestChannelTransportProviderRegistration/);
      expect(source).not.toMatch(/createTestChannel/);
      expect(source).not.toMatch(/from ["'][^"']*TestChannel/);
    });
  });
});
