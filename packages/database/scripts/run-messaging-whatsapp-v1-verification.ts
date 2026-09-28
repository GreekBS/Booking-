/**
 * WhatsApp V1 schema smoke — authorized demo DB.
 * Creates isolated platform connection + checks RLS; cleans up.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });

async function main(): Promise<void> {
  const {
    prisma,
    clearTenantContext,
    assertNotTalosProductionDatabase,
    isTalosProductionDatabaseUrl,
  } = await import("../src/index.js");

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "messaging-whatsapp-v1-verify");
    }
  }

  const results: Record<string, unknown> = {};
  const connId = randomUUID();
  const phoneNumberId = `pnid-verify-${connId.slice(0, 8)}`;

  await clearTenantContext(prisma);
  const unitBefore = await prisma.unit.count();
  const rateBefore = await prisma.ratePlan.count();

  try {
    await prisma.platformMessagingConnection.create({
      data: {
        id: connId,
        channel: "whatsapp",
        provider: "meta_cloud",
        phoneNumberId,
        displayPhoneNumber: "+15550001111",
        status: "connected",
        configJson: {},
      },
    });
    results.platformConnection = true;

    const found = await prisma.platformMessagingConnection.findFirst({
      where: { phoneNumberId },
    });
    results.lookupByPhoneNumberId = found?.id === connId;

    const tables = await prisma.$queryRaw<
      Array<{ relname: string; rls: boolean; forced: boolean }>
    >`
      SELECT c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
          'booking_messaging_profiles',
          'property_messaging_settings',
          'messaging_automation_runs',
          'messaging_secret_records',
          'messaging_wa_identity_routes',
          'platform_messaging_connections'
        )
    `;
    results.tables = tables;
    const tenantTables = tables.filter((t) =>
      [
        "booking_messaging_profiles",
        "property_messaging_settings",
        "messaging_automation_runs",
        "messaging_secret_records",
      ].includes(t.relname),
    );
    results.tenantRlsOk = tenantTables.every((t) => t.rls && t.forced);
    results.unitsUnchanged = (await prisma.unit.count()) === unitBefore;
    results.ratePlansUnchanged = (await prisma.ratePlan.count()) === rateBefore;

    const pass =
      results.platformConnection === true &&
      results.lookupByPhoneNumberId === true &&
      results.tenantRlsOk === true &&
      results.unitsUnchanged === true &&
      results.ratePlansUnchanged === true;

    console.log(JSON.stringify({ pass, results }, null, 2));
    if (!pass) process.exit(1);
  } finally {
    await clearTenantContext(prisma);
    await prisma.platformMessagingConnection.deleteMany({
      where: { phoneNumberId },
    });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
