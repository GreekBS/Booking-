#!/usr/bin/env tsx
/**
 * Authorized: enable LOGIN + password for talos_runtime on Talos DB.
 * Writes RUNTIME_DATABASE_URL into apps/web/.env.local without printing secrets.
 *
 * Requires:
 *   ALLOW_TALOS_PRODUCTION_DB_MUTATION=true
 *   DATABASE_URL / DIRECT_URL = privileged postgres connection
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  assertNotTalosProductionDatabase,
  extractSupabaseProjectRef,
  TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
} from "../src/safety/databaseTargetGuard.js";

const root = dirname(fileURLToPath(import.meta.url));
const envLocalPath = resolve(root, "../../../apps/web/.env.local");
loadEnv({ path: envLocalPath });
loadEnv({ path: resolve(root, "../.env") });

if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
  console.error("Requires ALLOW_TALOS_PRODUCTION_DB_MUTATION=true");
  process.exit(1);
}

const adminUrl =
  process.env.MIGRATION_DIRECT_URL?.trim() ||
  process.env.MIGRATION_DATABASE_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";

if (!adminUrl) {
  console.error("Missing privileged DATABASE_URL/DIRECT_URL");
  process.exit(1);
}

assertNotTalosProductionDatabase(adminUrl, "provision-talos-runtime-role");

const projectRef =
  extractSupabaseProjectRef(adminUrl) ?? TALOS_PRODUCTION_SUPABASE_PROJECT_REF;

function parseUrl(url: string): URL {
  return new URL(url);
}

function buildRuntimeUrl(template: string, password: string): string {
  const u = parseUrl(template);
  // Supabase pooler username: role.projectRef ; direct often role only.
  const host = u.hostname;
  const isPooler = host.includes("pooler.supabase.com");
  u.username = isPooler ? `talos_runtime.${projectRef}` : "talos_runtime";
  u.password = password;
  return u.toString();
}

function upsertEnvLocal(key: string, value: string): void {
  let text = existsSync(envLocalPath) ? readFileSync(envLocalPath, "utf8") : "";
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    if (text.length && !text.endsWith("\n")) text += "\n";
    text += `\n# F3.1 non-BYPASSRLS application role (do not commit)\n${line}\n`;
  }
  writeFileSync(envLocalPath, text, "utf8");
}

async function main() {
  const password = randomBytes(32).toString("base64url");
  const prisma = new PrismaClient({
    datasources: { db: { url: adminUrl } },
  });

  try {
    // Dollar-quote password so special chars cannot break SQL.
    const tag = `pw${randomBytes(8).toString("hex")}`;
    await prisma.$executeRawUnsafe(
      `ALTER ROLE talos_runtime WITH LOGIN PASSWORD $${tag}$${password}$${tag}$`,
    );

    const role = await prisma.$queryRaw<
      Array<{ rolname: string; rolbypassrls: boolean; rolcanlogin: boolean }>
    >`
      SELECT rolname, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'talos_runtime'
    `;
    if (!role[0] || role[0].rolbypassrls || !role[0].rolcanlogin) {
      throw new Error("talos_runtime role not ready (login/bypass check failed)");
    }

    // Prefer direct/session host for SET LOCAL / FOR UPDATE semantics.
    const template =
      process.env.DIRECT_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      adminUrl;
    const runtimeUrl = buildRuntimeUrl(template, password);
    const runtimeDirect = buildRuntimeUrl(
      process.env.DIRECT_URL?.trim() || template,
      password,
    );

    upsertEnvLocal("RUNTIME_DATABASE_URL", runtimeUrl);
    upsertEnvLocal("RUNTIME_DIRECT_URL", runtimeDirect);

    console.log(
      JSON.stringify(
        {
          status: "OK",
          role: "talos_runtime",
          rolbypassrls: false,
          rolcanlogin: true,
          envUpdated: ["RUNTIME_DATABASE_URL", "RUNTIME_DIRECT_URL"],
          note: "Secrets written to apps/web/.env.local only — not printed.",
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
