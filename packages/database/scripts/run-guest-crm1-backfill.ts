/**
 * CRM-1 historical Guest backfill for demo/test databases.
 *
 * Modes:
 *   DRY_RUN (default) — counts only, no writes
 *   APPLY — create Guests + link bookings.guest_id (idempotent)
 *
 * Usage:
 *   pnpm --filter @hcp/database exec tsx scripts/run-guest-crm1-backfill.ts
 *   pnpm --filter @hcp/database exec tsx scripts/run-guest-crm1-backfill.ts --apply
 *
 * Never prints raw PII — counts and hashed identifiers only.
 *
 * IMPORTANT: load dotenv BEFORE importing @hcp/database so Prisma binds
 * RUNTIME_DATABASE_URL (talos_runtime).
 */
import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

const APPLY = process.argv.includes("--apply");

function redactId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}

type BookingRow = {
  id: string;
  tenantId: string;
  guestId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
};

type ClusterKey = string;

async function main(): Promise<void> {
  const {
    PermissionChecker,
    ResolveOrCreateGuest,
    normalizeEmail,
    normalizePhone,
    namesAreCompatible,
  } = await import("@hcp/domain");
  const {
    prisma,
    PrismaGuestRepository,
    UuidIdGenerator,
    assertNotTalosProductionDatabase,
    isTalosProductionDatabaseUrl,
  } = await import("../src/index.js");

  type ActorContext = import("@hcp/domain").ActorContext;

  function clusterKeyFor(
    b: BookingRow,
  ): { key: ClusterKey; kind: string } | null {
    const email = normalizeEmail(b.guestEmail);
    if (email) {
      return { key: `email:${b.tenantId}:${email}`, kind: "email" };
    }
    const phone = normalizePhone(b.guestPhone);
    if (phone) {
      return { key: `phone:${b.tenantId}:${phone}`, kind: "phone" };
    }
    return null;
  }

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "guest-crm1-backfill");
    }
    console.log(
      JSON.stringify({
        warning:
          "Target is Talos Production project ref; proceeding with explicit ALLOW_TALOS_PRODUCTION_DB_MUTATION",
        mode: APPLY ? "APPLY" : "DRY_RUN",
      }),
    );
  }

  const bookings = await prisma.booking.findMany({
    select: {
      id: true,
      tenantId: true,
      guestId: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const total = bookings.length;
  const withoutGuestId = bookings.filter((b) => b.guestId == null);
  let usableEmails = 0;
  let placeholderEmails = 0;
  let missingEmails = 0;
  let usablePhones = 0;
  let missingPhones = 0;

  const clusters = new Map<
    ClusterKey,
    { kind: string; bookings: BookingRow[]; names: Set<string> }
  >();
  const noKey: BookingRow[] = [];

  for (const b of withoutGuestId) {
    const emailNorm = normalizeEmail(b.guestEmail);
    const rawEmail = (b.guestEmail || "").trim().toLowerCase();
    if (!rawEmail) missingEmails += 1;
    else if (!emailNorm) placeholderEmails += 1;
    else usableEmails += 1;

    const phoneNorm = normalizePhone(b.guestPhone);
    if (phoneNorm) usablePhones += 1;
    else missingPhones += 1;

    const ck = clusterKeyFor(b);
    if (!ck) {
      noKey.push(b);
      continue;
    }
    let c = clusters.get(ck.key);
    if (!c) {
      c = { kind: ck.kind, bookings: [], names: new Set() };
      clusters.set(ck.key, c);
    }
    c.bookings.push(b);
    c.names.add(b.guestName.trim().toLowerCase());
  }

  let strongClusters = 0;
  let ambiguousClusters = 0;
  let estimatedGuestsFromClusters = 0;
  let estimatedLinksFromClusters = 0;

  for (const c of clusters.values()) {
    const names = [...c.names];
    const allPairwiseOk = names.every((n) =>
      names.every((m) => namesAreCompatible(n, m)),
    );
    if (allPairwiseOk) {
      strongClusters += 1;
      estimatedGuestsFromClusters += 1;
      estimatedLinksFromClusters += c.bookings.length;
    } else {
      ambiguousClusters += 1;
      estimatedGuestsFromClusters += c.bookings.length;
      estimatedLinksFromClusters += c.bookings.length;
    }
  }

  const estimatedGuests = estimatedGuestsFromClusters + noKey.length;
  const estimatedLinks = estimatedLinksFromClusters + noKey.length;

  const dryRunReport = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    totalBookings: total,
    withoutGuestId: withoutGuestId.length,
    alreadyLinked: total - withoutGuestId.length,
    usableEmails,
    placeholderEmails,
    missingEmails,
    usablePhones,
    missingPhones,
    strongCandidateClusters: strongClusters,
    ambiguousClusters,
    noIdentityKeyBookings: noKey.length,
    estimatedGuestRows: estimatedGuests,
    estimatedBookingLinks: estimatedLinks,
    sampleClusterHashes: [...clusters.keys()].slice(0, 5).map(redactId),
  };

  console.log(JSON.stringify(dryRunReport, null, 2));

  if (!APPLY) {
    console.log(
      JSON.stringify({ status: "DRY_RUN_COMPLETE", next: "re-run with --apply" }),
    );
    await prisma.$disconnect();
    return;
  }

  const guestRepo = new PrismaGuestRepository();
  const resolver = new ResolveOrCreateGuest(
    guestRepo,
    new UuidIdGenerator(),
    new PermissionChecker(),
  );
  const actor: ActorContext = {
    userId: "00000000-0000-4000-8000-0000000000bf",
    role: "super_admin",
    propertyIds: null,
    isSuperAdmin: true,
  };

  let created = 0;
  let matched = 0;
  let ambiguous = 0;
  let linked = 0;
  let alreadyLinked = 0;
  let failed = 0;

  const snapshotHashesBefore = new Map<string, string>();
  for (const b of withoutGuestId) {
    snapshotHashesBefore.set(
      b.id,
      createHash("sha256")
        .update(`${b.guestName}|${b.guestEmail}|${b.guestPhone ?? ""}`)
        .digest("hex"),
    );
  }

  for (const b of withoutGuestId) {
    try {
      const result = await resolver.execute(
        {
          tenantId: b.tenantId,
          contact: {
            displayName: b.guestName,
            email: b.guestEmail,
            phone: b.guestPhone,
          },
        },
        actor,
      );
      if (result.isFailure) {
        failed += 1;
        console.error(
          JSON.stringify({
            error: "resolve_failed",
            booking: redactId(b.id),
            message: result.getError().message,
          }),
        );
        continue;
      }
      const value = result.getValue();
      if (value.outcome === "CREATED") created += 1;
      else if (value.outcome === "MATCHED") matched += 1;
      else ambiguous += 1;

      const link = await guestRepo.linkBookingGuestIfUnlinked(
        b.tenantId,
        b.id,
        value.guest.id,
      );
      if (link.linked) linked += 1;
      else if (link.alreadyLinked) alreadyLinked += 1;
    } catch (err) {
      failed += 1;
      console.error(
        JSON.stringify({
          error: "apply_failed",
          booking: redactId(b.id),
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  let snapshotMismatches = 0;
  const after = await prisma.booking.findMany({
    where: { id: { in: [...snapshotHashesBefore.keys()] } },
    select: {
      id: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
    },
  });
  for (const b of after) {
    const hash = createHash("sha256")
      .update(`${b.guestName}|${b.guestEmail}|${b.guestPhone ?? ""}`)
      .digest("hex");
    if (hash !== snapshotHashesBefore.get(b.id)) snapshotMismatches += 1;
  }

  const remainingUnlinked = await prisma.booking.count({
    where: { guestId: null },
  });
  const guestCount = await prisma.guest.count();

  const guestsBeforeReplay = guestCount;
  let replayLinked = 0;
  for (const b of withoutGuestId) {
    const current = await guestRepo.findBookingGuestLink(b.tenantId, b.id);
    if (!current?.guestId) continue;
    const link = await guestRepo.linkBookingGuestIfUnlinked(
      b.tenantId,
      b.id,
      current.guestId,
    );
    if (link.linked) replayLinked += 1;
  }
  const guestsAfterReplay = await prisma.guest.count();

  console.log(
    JSON.stringify(
      {
        status: "APPLY_COMPLETE",
        guestRowsTotal: guestCount,
        resolveCreated: created,
        resolveMatched: matched,
        resolveAmbiguous: ambiguous,
        bookingsLinked: linked,
        bookingsAlreadyLinked: alreadyLinked,
        bookingsLeftUnlinked: remainingUnlinked,
        failed,
        snapshotMismatches,
        idempotency: {
          guestsBeforeReplay,
          guestsAfterReplay,
          guestDelta: guestsAfterReplay - guestsBeforeReplay,
          replayNewlyLinked: replayLinked,
        },
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
