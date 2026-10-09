import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FEATURE = join(ROOT, "features", "website-themes");

describe("website builder B1 foundation fitness", () => {
  it("keeps modular structure under features/website-themes", () => {
    for (const rel of [
      "contracts.ts",
      "registry.ts",
      "prepare-render.ts",
      "validate-content.ts",
      "WebsiteThemeRenderer.tsx",
      "index.ts",
      "sanitize/richtext.ts",
      "sample/sample-content.ts",
      "sections/FoundationSectionViews.tsx",
      "themes/FoundationThemeLayout.tsx",
      "preview/WebsitePreviewShell.tsx",
      "preview/preview-viewports.ts",
    ]) {
      expect(existsSync(join(FEATURE, rel))).toBe(true);
    }
  });

  it("does not add public website routes or gallery UI in B1", () => {
    expect(
      existsSync(
        join(ROOT, "app", "(dashboard)", "dashboard", "website", "themes"),
      ),
    ).toBe(false);
    expect(
      existsSync(join(ROOT, "app", "(public)", "sites")),
    ).toBe(false);

    const renderer = readFileSync(
      join(FEATURE, "WebsiteThemeRenderer.tsx"),
      "utf8",
    );
    expect(renderer).not.toMatch(/publish|dns|customDomain/i);

    const shell = readFileSync(
      join(FEATURE, "preview", "WebsitePreviewShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("preview only");
    expect(shell).toContain("contain:");
    expect(shell).toContain("Isolated React subtree");
    // No iframe element / srcdoc attribute in the implementation.
    expect(shell).not.toMatch(/<iframe\b|srcDoc=|srcdoc=/i);
  });

  it("sample content is fictional and schema-backed", () => {
    const sample = readFileSync(
      join(FEATURE, "sample", "sample-content.ts"),
      "utf8",
    );
    expect(sample).toMatch(/fictional/i);
    expect(sample).toContain("parseWebsiteDraftContent");
    expect(sample).not.toMatch(/guestId|paymentIntent|channelCredential/i);
  });
});
