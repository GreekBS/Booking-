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

describe("operator-ui CleaningLocation Property.type awareness", () => {
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

  it("wires location use cases with property repository", () => {
    const container = read("lib/di/container.ts");
    expect(container).toContain("PrismaCleaningLocationRepository");
    expect(container).toContain("listCleaningLocationsBoardUseCase");
    expect(container).toContain("bulkInitializeCleaningLocationsUseCase");
    expect(container).toMatch(
      /new BulkInitializeCleaningLocationsUseCase\(\s*cleaningLocationRepository,\s*propertyRepository/s,
    );
    expect(container).toMatch(
      /new ListCleaningLocationsBoardUseCase\(\s*cleaningLocationRepository,\s*propertyRepository/s,
    );
  });

  it("hotel UI shows cleaning-location setup; clarifies units vs housekeeping", () => {
    const panel = read("features/housekeeping/CleaningLocationsPanel.tsx");
    expect(panel).toContain("Χώροι καθαρισμού");
    expect(panel).toContain("Ρύθμιση χώρων καθαρισμού");
    expect(panel).toContain("Πόσοι χώροι καθαρισμού;");
    expect(panel).toContain("Δημιουργία χώρων");
    expect(panel).toContain("Προσθήκη χώρου");
    expect(panel).toContain("Δεν δημιουργούν εμπορικές μονάδες");
    expect(panel).toContain("Καθαρισμός καταλύματος");
    expect(panel).toContain("isHotelType");
    expect(panel).toContain('type === "hotel"');
    expect(panel).toContain("showHotelSetup");
    expect(panel).toContain("showAddRoom");
    expect(panel).toContain("requiresManualResolution");
    expect(panel).toContain("QRCodeSVG");
    expect(panel).toContain("Σαρώστε για πρόσβαση στην καθαριότητα");
    expect(panel).toContain("μόνιμη προβολή");
    expect(panel).toContain("sm:flex-row");
    expect(panel).toContain("md:grid-cols-[1fr_auto]");

    const page = read("features/housekeeping/HousekeepingPage.tsx");
    expect(page).toContain("CleaningLocationsPanel");
    expect(page).toContain("property.type");
    expect(page).toContain("propertyName={property.name}");
  });

  it("catalog exposes Property.type for Active Property", () => {
    const types = read("lib/admin/types.ts");
    expect(types).toMatch(/CatalogPropertyRecord[\s\S]*type: string/);
    const domainCatalog = readRepo(
      "packages/domain/src/catalog/types/PropertyUnitCatalog.ts",
    );
    expect(domainCatalog).toContain("type: string");
  });

  it("exports location helpers from the admin API client", () => {
    const api = read("lib/admin/api.ts");
    expect(api).toContain("fetchCleaningLocationsBoard");
    expect(api).toContain("CleaningLocationsBoardResponse");
    expect(api).toContain("bulkInitializeCleaningLocations");
    expect(api).toContain("addCleaningLocation");
  });

  it("domain gates hotel-only mutations and single-location ensure", () => {
    const useCases = readRepo(
      "packages/domain/src/operations/cleaning/application/CleaningLocationUseCases.ts",
    );
    expect(useCases).toContain("isHotelCleaningLocationMode");
    expect(useCases).toContain("ensureSingleActive");
    expect(useCases).toContain("requiresManualResolution");
    expect(useCases).toContain("cleaning_location_last_active");

    const repo = readRepo(
      "packages/database/src/repositories/operations/cleaning/CleaningLocationRepository.ts",
    );
    expect(repo).toContain("ensureSingleActive");
    expect(repo).toContain("FOR UPDATE");
  });
});
