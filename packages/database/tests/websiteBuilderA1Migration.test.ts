import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20261009120000_website_builder_a1_foundation",
  "migration.sql",
);

describe("Website Builder A1 migration contract", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates the three foundation tables additively", () => {
    expect(sql).toContain('CREATE TABLE "websites"');
    expect(sql).toContain('CREATE TABLE "website_versions"');
    expect(sql).toContain('CREATE TABLE "website_media_assets"');
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"properties"\s+DROP/i);
  });

  it("enforces one website per property at the database level", () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "websites_property_id_uidx"');
    expect(sql).toContain('CREATE UNIQUE INDEX "websites_tenant_property_uidx"');
  });

  it("binds website/property ownership with composite tenant FKs", () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "properties_tenant_id_id_uidx"');
    expect(sql).toContain('CONSTRAINT "websites_tenant_id_property_id_fkey"');
    expect(sql).toContain('FOREIGN KEY ("tenant_id", "property_id")');
    expect(sql).toContain('REFERENCES "properties"("tenant_id", "id")');
    expect(sql).toContain('CONSTRAINT "website_versions_tenant_id_website_id_fkey"');
    expect(sql).toContain('FOREIGN KEY ("tenant_id", "website_id")');
    expect(sql).toContain('CONSTRAINT "website_media_assets_tenant_id_website_id_fkey"');
    expect(sql).toContain('CONSTRAINT "website_media_assets_tenant_id_property_id_fkey"');
  });

  it("prepares WebsiteVersion for draft/published snapshot workflows", () => {
    expect(sql).toContain('"sections" JSONB NOT NULL DEFAULT');
    expect(sql).toContain('"seo" JSONB NOT NULL DEFAULT');
    expect(sql).toContain("CHECK (\"state\" IN ('draft', 'published', 'superseded'))");
    expect(sql).toContain('"draft_version_id"');
    expect(sql).toContain('"published_version_id"');
    expect(sql).toContain('CONSTRAINT "websites_tenant_id_id_draft_version_id_fkey"');
    expect(sql).toContain('CONSTRAINT "websites_tenant_id_id_published_version_id_fkey"');
    expect(sql).toContain(
      'FOREIGN KEY ("tenant_id", "id", "draft_version_id")',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("tenant_id", "id", "published_version_id")',
    );
    expect(sql).toContain(
      'REFERENCES "website_versions"("tenant_id", "website_id", "id")',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "website_versions_tenant_website_id_uidx"',
    );
    expect(sql).toContain(
      "CHECK (\"status\" IN ('draft', 'published', 'unpublished'))",
    );
  });

  it("creates media metadata only (no storage / CDN wiring)", () => {
    expect(sql).toContain('"storage_key" VARCHAR(512) NOT NULL');
    expect(sql).toContain(
      "CHECK (\"status\" IN ('pending', 'ready', 'archived'))",
    );
    expect(sql).not.toMatch(/supabase/i);
    expect(sql).not.toMatch(/presign/i);
    expect(sql).not.toMatch(/CREATE\s+TABLE\s+"website_domains"/i);
  });

  it("enables FORCE RLS with WITH CHECK tenant isolation and runtime grants", () => {
    for (const table of ["websites", "website_versions", "website_media_assets"]) {
      expect(sql).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${table}" TO talos_runtime`);
    }
    expect(sql).toContain("WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)");
  });

  it("does not touch booking, channel, or copilot objects", () => {
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+"bookings"/i);
    expect(sql).not.toMatch(/channel_connections/i);
    expect(sql).not.toMatch(/copilot_/i);
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
  });
});
