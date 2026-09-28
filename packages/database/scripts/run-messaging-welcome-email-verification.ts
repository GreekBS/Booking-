/**
 * Welcome Email activation schema smoke — authorized demo DB.
 * Isolated contact-token + RLS checks; cleans up verification rows only.
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function main(): Promise<void> {
  const {
    prisma,
    prismaAdmin,
    clearTenantContext,
    setTenantContext,
    assertNotTalosProductionDatabase,
    isTalosProductionDatabaseUrl,
  } = await import("../src/index.js");

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "messaging-welcome-email-verify");
    }
  }

  const results: Record<string, unknown> = {
    workerRequiredForWelcomeEmail: false,
  };

  const tables = await prismaAdmin.$queryRaw<
    Array<{ relname: string; rls: boolean; forced: boolean }>
  >`
    SELECT c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'messaging_contact_tokens',
        'booking_messaging_profiles',
        'property_messaging_settings'
      )
  `;
  results.tables = tables;
  results.contactTokenRls =
    tables.find((t) => t.relname === "messaging_contact_tokens")?.forced ===
    true;

  const col = await prismaAdmin.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'booking_messaging_profiles'
      AND column_name IN ('welcome_email_status', 'active_contact_token_id')
  `;
  results.profileWelcomeColumns = col.map((c) => c.column_name).sort();

  const settingsCol = await prismaAdmin.$queryRaw<
    Array<{ column_name: string }>
  >`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'property_messaging_settings'
      AND column_name = 'welcome_email_enabled'
  `;
  results.welcomeEmailEnabledColumn = settingsCol.length === 1;

  // Isolated token row via admin + tenant GUC write path
  const tenant = await prismaAdmin.tenant.findFirst({
    select: { id: true },
  });
  const property = tenant
    ? await prismaAdmin.property.findFirst({
        where: { tenantId: tenant.id },
        select: { id: true },
      })
    : null;
  const booking =
    tenant && property
      ? await prismaAdmin.booking.findFirst({
          where: { tenantId: tenant.id, propertyId: property.id },
          select: { id: true },
        })
      : null;

  if (tenant && property && booking) {
    const tokenId = randomUUID();
    const profileId = randomUUID();
    const tokenHash = hashToken(`tlsc_verify_${tokenId.replace(/-/g, "")}`);
    let createdProfile = false;

    await setTenantContext(prisma, tenant.id);
    let profile = await prisma.bookingMessagingProfile.findUnique({
      where: { bookingId: booking.id },
    });
    if (!profile) {
      profile = await prisma.bookingMessagingProfile.create({
        data: {
          id: profileId,
          tenantId: tenant.id,
          propertyId: property.id,
          bookingId: booking.id,
          contactSource: "manual",
          messagingEnabled: false,
          identityStatus: "unbound",
          welcomeEmailStatus: "none",
        },
      });
      createdProfile = true;
    }

    await prisma.messagingContactToken.create({
      data: {
        id: tokenId,
        tenantId: tenant.id,
        propertyId: property.id,
        bookingId: booking.id,
        profileId: profile.id,
        tokenHash,
        status: "active",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await clearTenantContext(prisma);
    const byHash = await prisma.messagingContactToken.findUnique({
      where: { tokenHash },
    });
    results.tokenLookupNoTenantGuc = byHash?.id === tokenId;

    await setTenantContext(prisma, tenant.id);
    await prisma.messagingContactToken.delete({ where: { id: tokenId } });
    if (createdProfile) {
      await prisma.bookingMessagingProfile.delete({ where: { id: profile.id } });
    }
    results.isolatedCleanup = true;
  } else {
    results.tokenLookupNoTenantGuc = "skipped_no_booking";
    results.isolatedCleanup = "skipped";
  }

  results.pass =
    results.contactTokenRls === true &&
    results.welcomeEmailEnabledColumn === true &&
    Array.isArray(results.profileWelcomeColumns) &&
    (results.profileWelcomeColumns as string[]).includes(
      "welcome_email_status",
    ) &&
    (results.tokenLookupNoTenantGuc === true ||
      results.tokenLookupNoTenantGuc === "skipped_no_booking");

  console.log(JSON.stringify(results, null, 2));
  await clearTenantContext(prisma);
  process.exit(results.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
