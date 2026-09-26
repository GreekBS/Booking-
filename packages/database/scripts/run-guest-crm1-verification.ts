/**
 * CRM-1 authorized verification against the current demo DB.
 * Requires ALLOW_TALOS_PRODUCTION_DB_MUTATION=true when targeting prod project ref.
 * Creates only isolated crm1-verify-* tenants and cleans them up.
 *
 * IMPORTANT: load dotenv BEFORE importing @hcp/database so Prisma binds
 * RUNTIME_DATABASE_URL (talos_runtime, non-BYPASSRLS).
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

async function main(): Promise<void> {
  const {
    Guest,
    ResolveOrCreateGuest,
    PermissionChecker,
  } = await import("@hcp/domain");
  const {
    prisma,
    clearTenantContext,
    withTenantTransaction,
    PrismaGuestRepository,
    UuidIdGenerator,
    assertNotTalosProductionDatabase,
    isTalosProductionDatabaseUrl,
  } = await import("../src/index.js");

  type ActorContext = import("@hcp/domain").ActorContext;

  const TENANT_A = randomUUID();
  const TENANT_B = randomUUID();
  const slugA = `crm1-v-${TENANT_A.slice(0, 8)}`;
  const slugB = `crm1-v-${TENANT_B.slice(0, 8)}`;

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (isTalosProductionDatabaseUrl(dbUrl) || isTalosProductionDatabaseUrl(process.env.DATABASE_URL)) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "crm1-verify");
    }
  }

  const role = await prisma.$queryRawUnsafe<
    Array<{ current_user: string; rolbypassrls: boolean }>
  >(
    `SELECT current_user, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`,
  );

  const guests = new PrismaGuestRepository();
  const resolver = new ResolveOrCreateGuest(
    guests,
    new UuidIdGenerator(),
    new PermissionChecker(),
  );
  const actor: ActorContext = {
    userId: randomUUID(),
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };

  const results: Record<string, unknown> = {
    runtimeUser: role[0]?.current_user,
    runtimeBypassRls: role[0]?.rolbypassrls,
  };

  await clearTenantContext(prisma);
  await prisma.tenant.createMany({
    data: [
      { id: TENANT_A, name: "CRM1 Verify A", slug: slugA },
      { id: TENANT_B, name: "CRM1 Verify B", slug: slugB },
    ],
  });

  try {
    const rls = await prisma.$queryRaw<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >`
      SELECT c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'guests'
    `;
    results.rlsEnabled = rls[0]?.relrowsecurity === true;
    results.rlsForced = rls[0]?.relforcerowsecurity === true;

    const guestA = Guest.create({
      id: randomUUID(),
      tenantId: TENANT_A,
      displayName: "Verify Alice",
      email: `verify-alice-${TENANT_A.slice(0, 8)}@demo.test`,
    });
    await guests.save(guestA);

    results.sameTenantRead = (await guests.findById(TENANT_A, guestA.id)) != null;
    results.crossTenantReadAppFilter =
      (await guests.findById(TENANT_B, guestA.id)) == null;

    const rlsSelectAsB = await withTenantTransaction(TENANT_B, async (tx) => {
      return tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT count(*)::int AS c FROM guests WHERE id = $1::uuid`,
        guestA.id,
      );
    });
    results.rlsSelectCrossTenantCount = rlsSelectAsB[0]?.c ?? -1;

    const rlsUpdateAsB = await withTenantTransaction(TENANT_B, async (tx) => {
      return tx.$executeRawUnsafe(
        `UPDATE guests SET display_name = 'Hacked' WHERE id = $1::uuid`,
        guestA.id,
      );
    });
    results.rlsUpdateCrossTenantCount = rlsUpdateAsB;
    results.crossTenantWriteBlocked =
      (results.rlsSelectCrossTenantCount as number) === 0 &&
      (results.rlsUpdateCrossTenantCount as number) === 0;

    const still = await guests.findById(TENANT_A, guestA.id);
    results.crossTenantMutationPreservedName = still?.displayName === "Verify Alice";

    const missingCtx = await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant', '', true)`;
      return tx.$queryRawUnsafe<Array<{ c: number }>>(
        `SELECT count(*)::int AS c FROM guests`,
      );
    });
    // Note: emptying GUC inside tenant TX still on same connection — expect 0
    results.missingTenantContextGuestCount = missingCtx[0]?.c ?? -1;

    const email = `verify-concurrent-${randomUUID().slice(0, 8)}@demo.test`;
    const concurrent = await Promise.all(
      [0, 1, 2, 3].map(() =>
        resolver.execute(
          {
            tenantId: TENANT_A,
            contact: { displayName: "Concurrent Verify", email },
          },
          actor,
        ),
      ),
    );
    const ids = new Set(concurrent.map((r) => r.getValue().guest.id));
    results.concurrentStrongIdentityGuestCount = ids.size;
    results.concurrentStrongAllSuccess = concurrent.every((r) => r.isSuccess);

    const fam = `verify-family-${randomUUID().slice(0, 8)}@demo.test`;
    const [x, y] = await Promise.all([
      resolver.execute(
        { tenantId: TENANT_A, contact: { displayName: "Alice X", email: fam } },
        actor,
      ),
      resolver.execute(
        { tenantId: TENANT_A, contact: { displayName: "Bob Y", email: fam } },
        actor,
      ),
    ]);
    results.concurrentAmbiguousDistinct =
      x.getValue().guest.id !== y.getValue().guest.id;

    const linked = await prisma.booking.findMany({
      where: { guestId: { not: null } },
      select: { id: true, guestId: true },
      take: 10,
    });
    results.linkedBookingsSample = linked.length;
    results.linkedBookingsHaveGuestId = linked.every((b) => b.guestId != null);
    results.fiscalDocumentCount = await prisma.fiscalDocument.count();

    const pass =
      results.runtimeUser === "talos_runtime" &&
      results.runtimeBypassRls === false &&
      results.rlsEnabled === true &&
      results.rlsForced === true &&
      results.rlsSelectCrossTenantCount === 0 &&
      results.rlsUpdateCrossTenantCount === 0 &&
      results.crossTenantMutationPreservedName === true &&
      results.concurrentStrongIdentityGuestCount === 1 &&
      results.concurrentAmbiguousDistinct === true;

    console.log(
      JSON.stringify({ status: pass ? "PASS" : "FAIL", ...results }, null, 2),
    );
    if (!pass) process.exitCode = 1;
  } finally {
    await clearTenantContext(prisma);
    await prisma.guest.deleteMany({
      where: { tenantId: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
