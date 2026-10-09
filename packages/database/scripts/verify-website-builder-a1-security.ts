/**
 * Disposable local verification for Website Builder A1.
 *
 * - Creates database hcp_wb_a1_verify on 127.0.0.1 (never Production)
 * - migrate deploy through pre-A1, then applies A1 alone (no SQL patches)
 * - Seeds as admin; exercises RLS as LOGIN role talos_runtime (NOBYPASSRLS)
 * - Drops the disposable database on exit
 *
 * Usage (from packages/database):
 *   pnpm exec tsx scripts/verify-website-builder-a1-security.ts
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  assertNotTalosProductionDatabase,
  isTalosProductionDatabaseUrl,
} from "../src/safety/databaseTargetGuard.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(ROOT, "prisma", "migrations");
const A1_NAME = "20261009120000_website_builder_a1_foundation";
const A1_PATH = join(MIGRATIONS, A1_NAME);
const HOLD_ROOT = join(tmpdir(), "hcp-wb-a1-mig-hold");
const A1_HOLD = join(HOLD_ROOT, A1_NAME);
const PSQL = "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe";

const ADMIN_URL = "postgresql://hcp:hcp@127.0.0.1:5432/postgres";
const VERIFY_DB = "hcp_wb_a1_verify";
const VERIFY_ADMIN_URL = `postgresql://hcp:hcp@127.0.0.1:5432/${VERIFY_DB}?schema=public`;
const RUNTIME_PASS = "wb_a1_verify_runtime_only";
const RUNTIME_URL = `postgresql://talos_runtime:${RUNTIME_PASS}@127.0.0.1:5432/${VERIFY_DB}?schema=public`;

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];

function log(msg: string) {
  console.log(`[wb-a1-verify] ${msg}`);
}

function record(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

function psqlAdmin(sql: string, database = "postgres") {
  if (!existsSync(PSQL)) {
    throw new Error(`psql not found at ${PSQL}`);
  }
  try {
    execFileSync(
      PSQL,
      [
        "-h",
        "127.0.0.1",
        "-p",
        "5432",
        "-U",
        "hcp",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      {
        env: { ...process.env, PGPASSWORD: "hcp" },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
  } catch (e) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    throw new Error(
      `psql failed: ${(err.stderr?.toString() || err.stdout?.toString() || err.message || "").slice(0, 500)}`,
    );
  }
}

function migrateDeploy(url: string) {
  const r = spawnSync(
    "pnpm",
    ["exec", "prisma", "migrate", "deploy"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DATABASE_URL: url,
        DIRECT_URL: url,
      },
      encoding: "utf8",
      shell: true,
      windowsHide: true,
    },
  );
  if (r.status !== 0) {
    throw new Error(
      `migrate deploy failed: ${(r.stderr || r.stdout || "").slice(0, 800)}`,
    );
  }
  return r.stdout || "";
}

async function assertFail(
  name: string,
  fn: () => Promise<unknown>,
  match?: RegExp,
) {
  try {
    await fn();
    record(name, false, "expected failure but succeeded");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (match && !match.test(msg)) {
      record(name, false, `failed with unexpected error: ${msg.slice(0, 180)}`);
      return;
    }
    record(name, true, msg.slice(0, 120));
  }
}

async function main() {
  if (
    isTalosProductionDatabaseUrl(ADMIN_URL) ||
    isTalosProductionDatabaseUrl(VERIFY_ADMIN_URL)
  ) {
    throw new Error("REFUSING Production target");
  }
  assertNotTalosProductionDatabase(VERIFY_ADMIN_URL, "wb-a1-verify");

  let held = false;
  try {
    // Disposable DB
    psqlAdmin(`DROP DATABASE IF EXISTS ${VERIFY_DB} WITH (FORCE)`);
    psqlAdmin(`CREATE DATABASE ${VERIFY_DB} OWNER hcp`);
    log(`created disposable database ${VERIFY_DB}`);

    // Ensure runtime role exists with LOGIN for this verify (local only)
    psqlAdmin(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'talos_runtime') THEN
          CREATE ROLE talos_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE
            NOINHERIT NOBYPASSRLS NOREPLICATION NOLOGIN;
        END IF;
      END $$;
      ALTER ROLE talos_runtime WITH LOGIN PASSWORD '${RUNTIME_PASS}' NOBYPASSRLS NOSUPERUSER;
      GRANT CONNECT ON DATABASE ${VERIFY_DB} TO talos_runtime;
    `);

    // Phase 1: migrate everything EXCEPT A1 (hold outside prisma/migrations)
    if (!existsSync(A1_PATH)) {
      throw new Error(`missing A1 migration at ${A1_PATH}`);
    }
    rmSync(HOLD_ROOT, { recursive: true, force: true });
    mkdirSync(HOLD_ROOT, { recursive: true });
    renameSync(A1_PATH, A1_HOLD);
    held = true;
    const preOut = migrateDeploy(VERIFY_ADMIN_URL);
    log("pre-A1 migrate deploy complete");
    if (preOut.includes(A1_NAME)) {
      throw new Error("A1 was applied during pre-A1 phase");
    }

    // Phase 2: apply A1 alone from final migration SQL (no patches)
    renameSync(A1_HOLD, A1_PATH);
    held = false;
    rmSync(HOLD_ROOT, { recursive: true, force: true });
    const a1Out = migrateDeploy(VERIFY_ADMIN_URL);
    record(
      "fresh A1 migrate deploy from clean pre-A1 schema",
      a1Out.includes(A1_NAME),
      a1Out.slice(0, 240),
    );

    // Grants after A1 (role may have been created before default privileges)
    psqlAdmin(
      `
      GRANT USAGE ON SCHEMA public TO talos_runtime;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO talos_runtime;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO talos_runtime;
    `,
      VERIFY_DB,
    );

    const admin = new PrismaClient({
      datasources: { db: { url: VERIFY_ADMIN_URL } },
    });
    const runtime = new PrismaClient({
      datasources: { db: { url: RUNTIME_URL } },
    });

    try {
      // Role invariants
      const role = await runtime.$queryRaw<
        Array<{ current_user: string; rolbypassrls: boolean; rolsuper: boolean }>
      >`SELECT current_user, r.rolbypassrls, r.rolsuper
        FROM pg_roles r WHERE r.rolname = current_user`;
      record(
        "runtime role is talos_runtime without BYPASSRLS/superuser",
        role[0]?.current_user === "talos_runtime" &&
          role[0]?.rolbypassrls === false &&
          role[0]?.rolsuper === false,
        JSON.stringify(role[0]),
      );

      // Schema objects
      const tables = await admin.$queryRaw<Array<{ relname: string; forced: boolean }>>`
        SELECT c.relname, c.relforcerowsecurity AS forced
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('websites','website_versions','website_media_assets')
        ORDER BY 1`;
      record(
        "FORCE RLS on three website tables",
        tables.length === 3 && tables.every((t) => t.forced === true),
        JSON.stringify(tables),
      );

      const fks = await admin.$queryRaw<Array<{ conname: string; def: string }>>`
        SELECT c.conname, pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'websites'
          AND c.contype = 'f'
        ORDER BY 1`;
      const draftFk = fks.find(
        (f) => f.conname === "websites_tenant_id_id_draft_version_id_fkey",
      );
      record(
        "draft version FK binds tenant+website+version",
        !!draftFk?.def.includes("tenant_id") &&
          !!draftFk?.def.includes("website_id") &&
          !!draftFk?.def.includes("draft_version_id"),
        draftFk?.def,
      );

      // Seed as admin (BYPASSRLS)
      const TENANT_A = randomUUID();
      const TENANT_B = randomUUID();
      const PROP_A = randomUUID();
      const PROP_B = randomUUID();
      const PROP_A2 = randomUUID();
      const SITE_A = randomUUID();
      const SITE_A2 = randomUUID();
      const SITE_B = randomUUID();
      const VER_A = randomUUID();
      const VER_A2 = randomUUID();
      const VER_B = randomUUID();
      const MEDIA_A = randomUUID();
      const MEDIA_B = randomUUID();

      await admin.tenant.createMany({
        data: [
          { id: TENANT_A, name: "WB Verify A", slug: `wbva-${TENANT_A.slice(0, 8)}` },
          { id: TENANT_B, name: "WB Verify B", slug: `wbvb-${TENANT_B.slice(0, 8)}` },
        ],
      });
      await admin.property.createMany({
        data: [
          {
            id: PROP_A,
            tenantId: TENANT_A,
            name: "Prop A",
            slug: `pa-${PROP_A.slice(0, 6)}`,
            status: "active",
          },
          {
            id: PROP_A2,
            tenantId: TENANT_A,
            name: "Prop A2",
            slug: `pa2-${PROP_A2.slice(0, 6)}`,
            status: "active",
          },
          {
            id: PROP_B,
            tenantId: TENANT_B,
            name: "Prop B",
            slug: `pb-${PROP_B.slice(0, 6)}`,
            status: "active",
          },
        ],
      });

      // Create sites under SET LOCAL as runtime (authorized path)
      async function asTenant<T>(
        client: PrismaClient,
        tenantId: string,
        fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">) => Promise<T>,
      ): Promise<T> {
        return client.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
          return fn(tx as never);
        });
      }

      await asTenant(runtime, TENANT_A, async (tx) => {
        await tx.website.create({
          data: {
            id: SITE_A,
            tenantId: TENANT_A,
            propertyId: PROP_A,
            status: "draft",
            themeId: "unset",
          },
        });
        await tx.websiteVersion.create({
          data: {
            id: VER_A,
            tenantId: TENANT_A,
            websiteId: SITE_A,
            versionNumber: 1,
            locale: "el",
            sections: [],
            seo: {},
            state: "draft",
          },
        });
        await tx.website.update({
          where: { id: SITE_A },
          data: { draftVersionId: VER_A },
        });
        await tx.websiteMediaAsset.create({
          data: {
            id: MEDIA_A,
            tenantId: TENANT_A,
            websiteId: SITE_A,
            propertyId: PROP_A,
            storageKey: `wb-verify/${MEDIA_A}.jpg`,
            contentType: "image/jpeg",
            sizeBytes: 10,
            status: "pending",
          },
        });
      });
      record("same-tenant create website/version/media as talos_runtime", true);

      await asTenant(runtime, TENANT_B, async (tx) => {
        await tx.website.create({
          data: {
            id: SITE_B,
            tenantId: TENANT_B,
            propertyId: PROP_B,
            status: "draft",
            themeId: "unset",
          },
        });
        await tx.websiteVersion.create({
          data: {
            id: VER_B,
            tenantId: TENANT_B,
            websiteId: SITE_B,
            versionNumber: 1,
            locale: "el",
            sections: [],
            seo: {},
            state: "draft",
          },
        });
        await tx.websiteMediaAsset.create({
          data: {
            id: MEDIA_B,
            tenantId: TENANT_B,
            websiteId: SITE_B,
            propertyId: PROP_B,
            storageKey: `wb-verify/${MEDIA_B}.jpg`,
            contentType: "image/jpeg",
            sizeBytes: 10,
            status: "pending",
          },
        });
      });

      // Second website in tenant A for cross-website pointer tests
      await asTenant(runtime, TENANT_A, async (tx) => {
        await tx.website.create({
          data: {
            id: SITE_A2,
            tenantId: TENANT_A,
            propertyId: PROP_A2,
            status: "draft",
            themeId: "unset",
          },
        });
        await tx.websiteVersion.create({
          data: {
            id: VER_A2,
            tenantId: TENANT_A,
            websiteId: SITE_A2,
            versionNumber: 1,
            locale: "el",
            sections: [],
            seo: {},
            state: "draft",
          },
        });
      });

      // SELECT isolation
      const leakSite = await asTenant(runtime, TENANT_A, (tx) =>
        tx.website.findMany({ where: { id: SITE_B } }),
      );
      record("tenant A cannot SELECT tenant B website", leakSite.length === 0);

      const leakVer = await asTenant(runtime, TENANT_A, (tx) =>
        tx.websiteVersion.findMany({ where: { id: VER_B } }),
      );
      record("tenant A cannot SELECT tenant B version", leakVer.length === 0);

      const leakMedia = await asTenant(runtime, TENANT_A, (tx) =>
        tx.websiteMediaAsset.findMany({ where: { id: MEDIA_B } }),
      );
      record("tenant A cannot SELECT tenant B media", leakMedia.length === 0);

      const own = await asTenant(runtime, TENANT_A, (tx) =>
        tx.website.findUnique({ where: { id: SITE_A } }),
      );
      record("tenant A can SELECT own website", own?.id === SITE_A);

      // INSERT isolation
      await assertFail(
        "tenant A cannot INSERT website for tenant B property",
        () =>
          asTenant(runtime, TENANT_A, (tx) =>
            tx.website.create({
              data: {
                id: randomUUID(),
                tenantId: TENANT_A,
                propertyId: PROP_B,
                status: "draft",
                themeId: "unset",
              },
            }),
          ),
      );

      await assertFail(
        "tenant A cannot INSERT row with tenant B id (WITH CHECK)",
        () =>
          asTenant(runtime, TENANT_A, (tx) =>
            tx.website.create({
              data: {
                id: randomUUID(),
                tenantId: TENANT_B,
                propertyId: PROP_B,
                status: "draft",
                themeId: "unset",
              },
            }),
          ),
      );

      // UPDATE / DELETE isolation
      await assertFail(
        "tenant A cannot UPDATE tenant B website",
        async () => {
          const n = await asTenant(runtime, TENANT_A, (tx) =>
            tx.website.updateMany({
              where: { id: SITE_B },
              data: { themeId: "hacked" },
            }),
          );
          if (n.count === 0) throw new Error("rls_blocked_zero_rows");
        },
        /rls_blocked_zero_rows/,
      );

      await assertFail(
        "tenant A cannot DELETE tenant B media",
        async () => {
          const n = await asTenant(runtime, TENANT_A, (tx) =>
            tx.websiteMediaAsset.deleteMany({ where: { id: MEDIA_B } }),
          );
          if (n.count === 0) throw new Error("rls_blocked_zero_rows");
        },
        /rls_blocked_zero_rows/,
      );

      // Fail closed without tenant GUC
      await assertFail(
        "missing tenant context fails closed on INSERT",
        () =>
          runtime.website.create({
            data: {
              id: randomUUID(),
              tenantId: TENANT_A,
              propertyId: PROP_A,
              status: "draft",
              themeId: "unset",
            },
          }),
      );

      const openSelect = await runtime.website.findMany();
      record(
        "missing tenant context SELECT returns no rows",
        openSelect.length === 0,
        `count=${openSelect.length}`,
      );

      // Version pointer rules (use admin for clear FK errors; also try runtime)
      await assertFail(
        "draft pointer cannot reference another tenant version",
        () =>
          admin.website.update({
            where: { id: SITE_A },
            data: { draftVersionId: VER_B },
          }),
      );

      await assertFail(
        "draft pointer cannot reference another website version (same tenant)",
        () =>
          admin.website.update({
            where: { id: SITE_A },
            data: { draftVersionId: VER_A2 },
          }),
      );

      await assertFail(
        "draft pointer cannot reference nonexistent version",
        () =>
          admin.website.update({
            where: { id: SITE_A },
            data: { draftVersionId: randomUUID() },
          }),
      );

      await assertFail(
        "cannot delete version while draft pointer references it",
        () => admin.websiteVersion.delete({ where: { id: VER_A } }),
      );

      // Clearing pointer then delete works
      await admin.website.update({
        where: { id: SITE_A },
        data: { draftVersionId: null },
      });
      await admin.websiteVersion.delete({ where: { id: VER_A } });
      record("delete version after clearing draft pointer", true);

      // Prisma A1 consistency: full-schema migrate diff still reports
      // pre-existing non-A1 naming/default drift across the repo. Assert A1
      // website_* tables specifically have no drift vs schema.prisma.
      const diff = spawnSync(
        "npx",
        [
          "prisma",
          "migrate",
          "diff",
          "--from-url",
          VERIFY_ADMIN_URL,
          "--to-schema-datamodel",
          "prisma/schema.prisma",
          "--exit-code",
        ],
        {
          cwd: ROOT,
          env: { ...process.env, DATABASE_URL: VERIFY_ADMIN_URL, DIRECT_URL: VERIFY_ADMIN_URL },
          encoding: "utf8",
          shell: false,
          windowsHide: true,
        },
      );
      const diffOut = `${diff.stdout || ""}\n${diff.stderr || ""}`;
      const a1TableDrift = /Changed the `(websites|website_versions|website_media_assets)` table/.test(
        diffOut,
      );
      record(
        "Prisma A1 tables match schema (no website_* migrate-diff drift)",
        !a1TableDrift,
        a1TableDrift
          ? diffOut.slice(0, 400)
          : `full-schema exit=${diff.status} (pre-existing non-A1 drift ignored)`,
      );
    } finally {
      await runtime.$disconnect();
      await admin.$disconnect();
    }
  } finally {
    if (held && existsSync(A1_HOLD) && !existsSync(A1_PATH)) {
      renameSync(A1_HOLD, A1_PATH);
    }
    try {
      psqlAdmin(`DROP DATABASE IF EXISTS ${VERIFY_DB} WITH (FORCE)`);
      log(`dropped disposable database ${VERIFY_DB}`);
    } catch (e) {
      log(`cleanup warning: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(
    JSON.stringify(
      {
        summary: {
          total: checks.length,
          passed: checks.filter((c) => c.ok).length,
          failed: failed.length,
        },
        checks,
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  if (existsSync(A1_HOLD) && !existsSync(A1_PATH)) {
    renameSync(A1_HOLD, A1_PATH);
  }
  process.exit(1);
});
