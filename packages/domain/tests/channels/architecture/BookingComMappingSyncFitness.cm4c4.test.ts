import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  BOOKING_COM_PROVIDER_SCOPE_RELATIVE_PATHS,
  findForbiddenBookingComProviderImports,
} from "../../../src/channels/architecture/transportDependencyPolicy";

const DOMAIN_ROOT = join(process.cwd());
const CHANNELS_SRC = join(DOMAIN_ROOT, "src", "channels");

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

function collectScopedFiles(relativePaths: readonly string[]): string[] {
  const files: string[] = [];
  for (const scopePath of relativePaths) {
    const absolute = join(CHANNELS_SRC, scopePath);
    if (!existsSync(absolute)) continue;
    const stat = statSync(absolute);
    if (stat.isFile() && absolute.endsWith(".ts")) {
      files.push(absolute);
    } else if (stat.isDirectory()) {
      files.push(...collectTsFiles(absolute));
    }
  }
  return files;
}

describe("CM-4c-4 architecture fitness", () => {
  it("mapping/sync/recon use cases do not call Booking.com HTTP clients", () => {
    const paths = [
      "application/UpsertChannelProductMappingUseCase.ts",
      "application/ValidateBookingComMappingsUseCase.ts",
      "application/GenerateBookingComInitialSyncPreviewUseCase.ts",
      "application/ConfirmBookingComInitialSyncUseCase.ts",
      "application/ReconcileBookingComConnectionUseCase.ts",
      "application/DiscoverBookingComRemoteConfigUseCase.ts",
      "application/BookingComActivationGate.ts",
    ];
    for (const rel of paths) {
      const source = readFileSync(join(CHANNELS_SRC, rel), "utf8");
      expect(source).not.toMatch(/fetch\s*\(/);
      expect(source).not.toMatch(/undici/);
      expect(source).not.toMatch(/node-fetch/);
      expect(source).not.toMatch(/IBookingComAriClient/);
      expect(source).not.toMatch(/IBookingComTokenClient/);
    }
  });

  it("Confirm enqueues only via RequestBookingComAriPropagationUseCase", () => {
    const source = readFileSync(
      join(CHANNELS_SRC, "application/ConfirmBookingComInitialSyncUseCase.ts"),
      "utf8",
    );
    expect(source).toMatch(/RequestBookingComAriPropagationUseCase/);
    expect(source).not.toMatch(/pushAvailabilityRatesRestrictions/);
    expect(source).not.toMatch(/IBookingComAriClient/);
  });

  it("Reconcile routes reservations through summary recovery / Receive path only", () => {
    const source = readFileSync(
      join(CHANNELS_SRC, "application/ReconcileBookingComConnectionUseCase.ts"),
      "utf8",
    );
    expect(source).toMatch(/BookingComSummaryRecoveryUseCase/);
    expect(source).toMatch(/ReceiveChannelEventUseCase/);
    expect(source).toMatch(/RequestBookingComAriPropagationUseCase/);
    expect(source).not.toMatch(/pushAvailabilityRatesRestrictions/);
    expect(source).toMatch(/Mapping ambiguity \/ drift NEVER auto-heals/);
  });

  it("Booking.com provider modules remain free of forbidden imports", () => {
    for (const file of collectScopedFiles(BOOKING_COM_PROVIDER_SCOPE_RELATIVE_PATHS)) {
      const source = readFileSync(file, "utf8");
      const rel = relative(CHANNELS_SRC, file);
      expect(
        findForbiddenBookingComProviderImports(source),
        `${rel} must not match forbidden patterns`,
      ).toEqual([]);
    }
  });

  it("DI wires NotConfigured discovery/ARI readers (no live HTTP)", () => {
    const di = readFileSync(
      join(DOMAIN_ROOT, "..", "..", "apps", "web", "lib", "di", "container.ts"),
      "utf8",
    );
    expect(di).toMatch(/BookingComRemoteDiscoveryClientNotConfigured/);
    expect(di).toMatch(/BookingComRemoteAriReaderNotConfigured/);
    expect(di).toMatch(/BookingComActivationGate/);
    expect(di).not.toMatch(/new FakeBookingComRemoteDiscoveryClient/);
    expect(di).not.toMatch(/new FakeBookingComRemoteAriReader/);
  });
});
