import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260717180000_cm4b_s3a_semantic_persistence",
  "migration.sql",
);

describe("CM-4b S3a migration contract", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("backfills existing connections fail-closed before enforcing non-null", () => {
    const backfill = sql.indexOf('UPDATE "channel_connections"');
    const setNotNull = sql.indexOf('ALTER COLUMN "semantic_mode" SET NOT NULL');

    expect(backfill).toBeGreaterThan(-1);
    expect(setNotNull).toBeGreaterThan(backfill);
    expect(sql).toContain('"semantic_mode" = \'mixed_or_unknown_feed\'');
    expect(sql).toContain('"semantic_config_version" = 1');
  });

  it("installs permanent defaults and positive-version constraints", () => {
    expect(sql).toContain(
      'ALTER COLUMN "semantic_mode" SET DEFAULT \'mixed_or_unknown_feed\'',
    );
    expect(sql).toContain('ALTER COLUMN "semantic_config_version" SET DEFAULT 1');
    expect(sql).toContain('CHECK ("semantic_config_version" >= 1)');
  });

  it("widens audit resource identity without rewriting audit rows", () => {
    expect(sql).toContain(
      'ALTER COLUMN "resource_id" TYPE VARCHAR(255)',
    );
    expect(sql).toContain('USING "resource_id"::text');
    expect(sql).not.toMatch(/UPDATE\s+"audit_logs"/i);
  });

  it("creates a dedicated tenant-isolated command receipt table", () => {
    expect(sql).toContain('CREATE TABLE "channel_semantic_transition_commands"');
    expect(sql).toContain(
      'PRIMARY KEY ("tenant_id", "operation", "command_id")',
    );
    expect(sql).toContain(
      'ALTER TABLE "channel_semantic_transition_commands" ENABLE ROW LEVEL SECURITY',
    );
    expect(sql).toContain(
      'CREATE POLICY "tenant_isolation_channel_semantic_transition_commands"',
    );
  });

  it("does not perform operator, cursor, Inbox, or Booking side effects", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"audit_logs"/i);
    expect(sql).not.toMatch(/channel_poll_cursors/i);
    expect(sql).not.toMatch(/channel_inbox_items/i);
    expect(sql).not.toMatch(/bookings/i);
    expect(sql).not.toMatch(/background_jobs/i);
  });
});
