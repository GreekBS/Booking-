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

describe("operator-ui QR cleaning V1", () => {
  it("exposes the QR admin API surface", () => {
    for (const route of [
      "app/api/admin/v1/units/[unitId]/qr/route.ts",
      "app/api/admin/v1/units/[unitId]/qr/rotate/route.ts",
      "app/api/admin/v1/qr/resolve/route.ts",
      "app/api/admin/v1/cleaning/templates/route.ts",
      "app/api/admin/v1/cleaning/context/route.ts",
      "app/api/admin/v1/cleaning/executions/route.ts",
      "app/api/admin/v1/cleaning/executions/[executionId]/items/[itemId]/route.ts",
      "app/api/admin/v1/cleaning/executions/[executionId]/photos/route.ts",
      "app/api/admin/v1/cleaning/executions/[executionId]/photos/[photoId]/route.ts",
      "app/api/admin/v1/cleaning/executions/[executionId]/complete/route.ts",
      "app/api/admin/v1/cleaning/history/route.ts",
    ]) {
      expect(existsSync(join(root, route)), route).toBe(true);
    }

    const templates = read("app/api/admin/v1/cleaning/templates/route.ts");
    expect(templates).toContain("export async function GET");
    expect(templates).toContain("export async function PUT");

    const items = read(
      "app/api/admin/v1/cleaning/executions/[executionId]/items/[itemId]/route.ts",
    );
    expect(items).toContain("export async function PATCH");

    const photo = read(
      "app/api/admin/v1/cleaning/executions/[executionId]/photos/[photoId]/route.ts",
    );
    expect(photo).toContain("export async function DELETE");
  });

  it("requires tenant context on every cleaning route", () => {
    for (const route of [
      "app/api/admin/v1/units/[unitId]/qr/route.ts",
      "app/api/admin/v1/qr/resolve/route.ts",
      "app/api/admin/v1/cleaning/context/route.ts",
      "app/api/admin/v1/cleaning/executions/route.ts",
      "app/api/admin/v1/cleaning/executions/[executionId]/complete/route.ts",
      "app/api/admin/v1/cleaning/history/route.ts",
    ]) {
      const source = read(route);
      expect(source, route).toContain("requireTenantContext");
      expect(source, route).toContain("toPermissionActor");
    }
  });

  it("scanned QR landing page is auth-gated and resolves server-side", () => {
    const page = read("app/q/[token]/page.tsx");
    expect(page).toContain("QrLandingPage");

    const landing = read("features/cleaning/QrLandingPage.tsx");
    expect(landing).toContain("resolveQrToken");
    expect(landing).toContain("CleaningForm");
    // The token itself must never be treated as a credential client-side.
    expect(landing).not.toContain("localStorage");

    const layout = read("app/q/layout.tsx");
    expect(layout).toContain("TenantProvider");
  });

  it("middleware preserves a safe callbackUrl through login", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toContain("buildLoginUrl");
    expect(middleware).toContain("isSafeCallbackUrl");
    expect(middleware).toContain("callbackUrl");

    const signIn = read("features/auth/CredentialsSignInForm.tsx");
    expect(signIn).toContain("sanitizeCallbackUrl");
    expect(signIn).toContain("router.push(resolveCallbackUrl())");
  });

  it("rejects open-redirect callbackUrl values", async () => {
    const { isSafeCallbackUrl, sanitizeCallbackUrl, buildLoginUrl } =
      await import("@/lib/auth/callback-url");

    expect(isSafeCallbackUrl("/q/abc")).toBe(true);
    expect(isSafeCallbackUrl("/dashboard/housekeeping?view=today")).toBe(true);

    expect(isSafeCallbackUrl("https://evil.example/x")).toBe(false);
    expect(isSafeCallbackUrl("//evil.example/x")).toBe(false);
    expect(isSafeCallbackUrl("/\\evil.example")).toBe(false);
    expect(isSafeCallbackUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeCallbackUrl("/login")).toBe(false);
    expect(isSafeCallbackUrl(null)).toBe(false);

    expect(sanitizeCallbackUrl("//evil.example")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/q/token")).toBe("/q/token");
    expect(buildLoginUrl("/q/abc")).toBe("/login?callbackUrl=%2Fq%2Fabc");
    expect(buildLoginUrl("https://evil.example")).toBe("/login");
  });

  it("mobile cleaning form enforces the documented photo limits", () => {
    const form = read("features/cleaning/CleaningForm.tsx");
    expect(form).toContain("image/jpeg,image/png,image/webp");
    expect(form).toContain("10 * 1024 * 1024");
    expect(form).toContain("MAX_PHOTOS = 12");
    expect(form).toContain("Ολοκλήρωση καθαρισμού");
    expect(form).toContain("Έναρξη καθαρισμού");
    // Touch targets sized for gloved, one-handed use.
    expect(form).toContain("min-h-12");
    expect(form).toContain("min-h-14");
    expect(form).toContain('capture="environment"');
  });

  it("Units page offers generate / print / rotate for the unit QR", () => {
    const units = read("features/units/UnitsPage.tsx");
    expect(units).toContain("UnitQrSheet");
    expect(units).toContain("QR καθαριότητας");

    const sheet = read("features/cleaning/UnitQrSheet.tsx");
    expect(sheet).toContain("generateUnitQr");
    expect(sheet).toContain("rotateUnitQr");
    expect(sheet).toContain("QRCodeSVG");
    expect(sheet).toContain("/dashboard/units/qr/");
    // Hash-only storage: an existing code can never be redisplayed.
    expect(sheet).toContain("δεν εμφανίζονται ξανά");
  });

  it("print page is print-friendly and never silently rotates", () => {
    const print = read("features/cleaning/UnitQrPrintPage.tsx");
    expect(print).toContain("@media print");
    expect(print).toContain("qr-print-hide");
    expect(print).toContain("window.print()");
    expect(print).toContain("Αντικατάσταση &amp; εκτύπωση νέου");
    expect(
      existsSync(
        join(root, "app/(dashboard)/dashboard/units/qr/[unitId]/print/page.tsx"),
      ),
    ).toBe(true);
  });

  it("housekeeping links to the checklist editor and cleaning history", () => {
    const page = read("features/housekeeping/HousekeepingPage.tsx");
    expect(page).toContain("/dashboard/housekeeping/checklist");
    expect(page).toContain("/dashboard/housekeeping/history");

    const editor = read("features/cleaning/CleaningChecklistEditor.tsx");
    expect(editor).toContain("saveCleaningTemplate");
    expect(editor).toContain("minimumCompletionPhotos");
    expect(editor).toContain("Απαιτείται φωτογραφία");
    expect(editor).toContain("useActiveProperty");

    const history = read("features/cleaning/CleaningHistoryPage.tsx");
    expect(history).toContain("listCleaningHistory");
    expect(history).toContain('searchParams.get("unitId")');
  });

  it("client api helpers cover the whole cleaning flow", () => {
    const api = read("lib/admin/api.ts");
    for (const helper of [
      "export async function fetchUnitQr",
      "export async function generateUnitQr",
      "export async function rotateUnitQr",
      "export async function resolveQrToken",
      "export async function fetchCleaningTemplate",
      "export async function saveCleaningTemplate",
      "export async function fetchCleaningContext",
      "export async function startCleaning",
      "export async function updateCleaningItem",
      "export async function uploadCleaningPhoto",
      "export async function deleteCleaningPhoto",
      "export async function completeCleaning",
      "export async function listCleaningHistory",
    ]) {
      expect(api, helper).toContain(helper);
    }
  });

  it("DI wires cleaning repositories and object storage", () => {
    const container = read("lib/di/container.ts");
    expect(container).toContain("PrismaUnitQrAccessRepository");
    expect(container).toContain("PrismaCleaningChecklistRepository");
    expect(container).toContain("PrismaCleaningExecutionRepository");
    expect(container).toContain("PrismaCleaningPhotoRepository");
    expect(container).toContain("createCleaningObjectStorage");
    expect(container).toContain("completeCleaningUseCase");
  });

  it("documents the design in ADR-030", () => {
    const adr = readRepo("docs/adr/030-qr-cleaning.md");
    expect(adr).toContain("ADR-030");
    expect(adr).toContain("SHA-256");
    expect(adr).toContain("createSignedUrl");
    expect(adr).toContain("completeHousekeepingTask");
  });
});
