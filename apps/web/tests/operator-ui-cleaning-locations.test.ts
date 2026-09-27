import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const repoRoot = join(root, "..", "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("operator-ui CleaningLocation V1", () => {
  it("exposes cleaning location admin API routes", () => {
    for (const route of [
      "app/api/admin/v1/cleaning/locations/route.ts",
      "app/api/admin/v1/cleaning/locations/bulk-initialize/route.ts",
      "app/api/admin/v1/cleaning/locations/[locationId]/route.ts",
      "app/api/admin/v1/cleaning/locations/[locationId]/archive/route.ts",
      "app/api/admin/v1/cleaning/locations/[locationId]/qr/route.ts",
      "app/api/admin/v1/cleaning/locations/[locationId]/qr/rotate/route.ts",
      "app/(dashboard)/dashboard/housekeeping/locations/qr/[locationId]/print/page.tsx",
    ]) {
      expect(existsSync(join(root, route)), route).toBe(true);
    }
  });

  it("requires tenant context on location routes", () => {
    for (const route of [
      "app/api/admin/v1/cleaning/locations/route.ts",
      "app/api/admin/v1/cleaning/locations/bulk-initialize/route.ts",
      "app/api/admin/v1/cleaning/locations/[locationId]/route.ts",
      "app/api/admin/v1/cleaning/locations/[locationId]/archive/route.ts",
      "app/api/admin/v1/cleaning/locations/[locationId]/qr/route.ts",
      "app/api/admin/v1/cleaning/locations/[locationId]/qr/rotate/route.ts",
    ]) {
      const source = read(route);
      expect(source, route).toContain("requireTenantContext");
      expect(source, route).toContain("toPermissionActor");
    }
  });

  it("wires location use cases in the DI container", () => {
    const container = read("lib/di/container.ts");
    expect(container).toContain("PrismaCleaningLocationRepository");
    expect(container).toContain("PrismaCleaningLocationQrAccessRepository");
    expect(container).toContain("listCleaningLocationsBoardUseCase");
    expect(container).toContain("bulkInitializeCleaningLocationsUseCase");
    expect(container).toContain("resolveCleaningQrUseCase");
  });

  it("shows Greek Δωμάτια setup and management UI", () => {
    const panel = read("features/housekeeping/CleaningLocationsPanel.tsx");
    expect(panel).toContain("Δωμάτια");
    expect(panel).toContain("Πόσα δωμάτια έχει το κατάλυμα;");
    expect(panel).toContain("Δημιουργία δωματίων");
    expect(panel).toContain("Προσθήκη δωματίου");
    expect(panel).toContain("Μετονομασία");
    expect(panel).toContain("Αρχειοθέτηση");
    expect(panel).toContain("Αντικατάσταση");
    expect(panel).toContain("QRCodeSVG");

    const page = read("features/housekeeping/HousekeepingPage.tsx");
    expect(page).toContain("CleaningLocationsPanel");
  });

  it("exports location helpers from the admin API client", () => {
    const api = read("lib/admin/api.ts");
    expect(api).toContain("fetchCleaningLocationsBoard");
    expect(api).toContain("bulkInitializeCleaningLocations");
    expect(api).toContain("addCleaningLocation");
    expect(api).toContain("renameCleaningLocation");
    expect(api).toContain("archiveCleaningLocation");
    expect(api).toContain("generateCleaningLocationQr");
    expect(api).toContain("rotateCleaningLocationQr");
  });

  it("qr resolve prefers location use case", () => {
    const resolve = read("app/api/admin/v1/qr/resolve/route.ts");
    expect(resolve).toContain("resolveCleaningQrUseCase");
    expect(resolve).toContain("locationId");
  });

  it("persists location repositories in database package", () => {
    expect(
      existsSync(
        join(
          repoRoot,
          "packages/database/src/repositories/operations/cleaning/CleaningLocationRepository.ts",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          repoRoot,
          "packages/database/src/repositories/operations/cleaning/CleaningLocationQrAccessRepository.ts",
        ),
      ),
    ).toBe(true);
    const index = readRepo("packages/database/src/index.ts");
    expect(index).toContain("PrismaCleaningLocationRepository");
    expect(index).toContain("PrismaCleaningLocationQrAccessRepository");
  });
});
