import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260717190000_cm4b_s3b_durable_cursor",
  "migration.sql",
);

describe("CM-4b S3b migration contract", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("creates only the provider-neutral cursor persistence shape", () => {
    expect(sql).toContain('CREATE TABLE "channel_poll_cursors"');
    expect(sql).toContain('PRIMARY KEY ("tenant_id", "connection_id")');
    expect(sql).toContain('"payload" TEXT NOT NULL');
    expect(sql).toContain('"version" INTEGER NOT NULL');
    expect(sql).toContain('"semantic_config_version" INTEGER NOT NULL');
    expect(sql).not.toMatch(/ical|etag|last_modified|poll_started|scheduler/i);
  });

  it("enforces positive versions and the cascading composite connection FK", () => {
    expect(sql).toContain('CHECK ("version" >= 1)');
    expect(sql).toContain('CHECK ("semantic_config_version" >= 1)');
    expect(sql).toContain(
      'FOREIGN KEY ("tenant_id", "connection_id")',
    );
    expect(sql).toContain(
      'REFERENCES "channel_connections"("tenant_id", "id")',
    );
    expect(sql).toContain("ON DELETE CASCADE");
  });

  it("enables established tenant-context RLS without FORCE", () => {
    expect(sql).toContain(
      'ALTER TABLE "channel_poll_cursors" ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain('current_setting(\'app.current_tenant\', true)');
    expect(sql).not.toMatch(/FORCE ROW LEVEL SECURITY/);
  });

  it("creates no rows and introduces no S3c-or-later side effects", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
    expect(sql).not.toMatch(/UPDATE\s+"channel_connections"/i);
    expect(sql).not.toMatch(/audit_logs/i);
    expect(sql).not.toMatch(/channel_semantic_transition_commands/i);
    expect(sql).not.toMatch(/channel_inbox_items/i);
    expect(sql).not.toMatch(/bookings/i);
    expect(sql).not.toMatch(/background_jobs/i);
  });
});
