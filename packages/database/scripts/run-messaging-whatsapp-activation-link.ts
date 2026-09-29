/**
 * Demo/dev-only: mint the same WhatsApp activation wa.me link the Welcome Email would contain.
 *
 * Does NOT send email, enqueue BackgroundJob, consume the token, or invent a phone number.
 *
 * Usage (from packages/database):
 *   pnpm exec tsx scripts/run-messaging-whatsapp-activation-link.ts
 *
 * Env (optional):
 *   MESSAGING_DEMO_TENANT_SLUG=demo
 *   MESSAGING_DEMO_PROPERTY_SLUG=olive
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  PrepareBookingWhatsAppActivationLinkUseCase,
  extractContactTokenFromText,
} from "@hcp/domain";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });

const DEMO_TENANT_SLUG =
  process.env.MESSAGING_DEMO_TENANT_SLUG?.trim() || "demo";
const DEMO_PROPERTY_SLUG =
  process.env.MESSAGING_DEMO_PROPERTY_SLUG?.trim() || "olive";
const DEMO_GUEST_NAME = "WhatsApp Activation Test Guest";
const DEMO_GUEST_EMAIL = "wa-activation-test@demo.talos.local";

async function main(): Promise<void> {
  const {
    prisma,
    prismaAdmin,
    clearTenantContext,
    setTenantContext,
    withTenantTransaction,
    assertNotTalosProductionDatabase,
    isTalosProductionDatabaseUrl,
    PrismaBookingRepository,
    PrismaPropertyRepository,
    PrismaOutboxRepository,
    PrismaBookingMessagingProfileRepository,
    PrismaMessagingContactTokenRepository,
    PrismaPlatformMessagingConnectionRepository,
    CryptoOpaqueTokenFactory,
    UuidIdGenerator,
  } = await import("../src/index.js");

  const dbUrl = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
  if (
    isTalosProductionDatabaseUrl(dbUrl) ||
    isTalosProductionDatabaseUrl(process.env.DATABASE_URL)
  ) {
    if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
      assertNotTalosProductionDatabase(dbUrl, "wa-activation-link-demo");
    }
  }

  await clearTenantContext(prisma);

  // --- Fail closed: central Talos WhatsApp connection ---
  const connection =
    await prisma.platformMessagingConnection.findFirst({
      where: { channel: "whatsapp", status: "connected" },
      select: {
        id: true,
        phoneNumberId: true,
        displayPhoneNumber: true,
        status: true,
      },
    });

  if (!connection) {
    console.error(
      JSON.stringify(
        {
          blocked: true,
          reason: "platform_whatsapp_connection_missing",
          required:
            "Create/upsert PlatformMessagingConnection with channel=whatsapp, status=connected, phoneNumberId=<Meta Phone Number ID>, displayPhoneNumber=<E.164 central Talos WhatsApp number e.g. +30...>. Credential/token sealing is separate; displayPhoneNumber is required for wa.me.",
          note: "No number was invented. No token was minted. No Booking was created.",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  if (!connection.displayPhoneNumber?.trim()) {
    console.error(
      JSON.stringify(
        {
          blocked: true,
          reason: "display_phone_number_missing",
          platformConnectionId: connection.id,
          phoneNumberIdPresent: Boolean(connection.phoneNumberId),
          required:
            "Set platform_messaging_connections.display_phone_number to the public E.164 of the central Talos WhatsApp Business number (digits used in https://wa.me/<digits>). Do not invent a number.",
          note: "No token was minted.",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const tenant = await prismaAdmin.tenant.findFirst({
    where: { slug: DEMO_TENANT_SLUG, deletedAt: null },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    console.error(
      JSON.stringify({
        blocked: true,
        reason: "demo_tenant_missing",
        expectedSlug: DEMO_TENANT_SLUG,
      }),
    );
    process.exit(2);
  }

  const property = await prismaAdmin.property.findFirst({
    where: {
      tenantId: tenant.id,
      slug: DEMO_PROPERTY_SLUG,
      deletedAt: null,
    },
    select: { id: true, name: true, slug: true },
  });
  if (!property) {
    console.error(
      JSON.stringify({
        blocked: true,
        reason: "demo_property_missing",
        tenantSlug: DEMO_TENANT_SLUG,
        expectedPropertySlug: DEMO_PROPERTY_SLUG,
      }),
    );
    process.exit(2);
  }

  // Prefer existing confirmed booking on this property; else create scoped demo booking.
  let booking = await prismaAdmin.booking.findFirst({
    where: {
      tenantId: tenant.id,
      propertyId: property.id,
      status: "confirmed",
      guestEmail: DEMO_GUEST_EMAIL,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      guestName: true,
      guestEmail: true,
      guestId: true,
      checkIn: true,
      checkOut: true,
      status: true,
    },
  });

  let createdBooking = false;
  if (!booking) {
    const unit = await prismaAdmin.unit.findFirst({
      where: { tenantId: tenant.id, propertyId: property.id, deletedAt: null },
      select: { id: true },
    });
    if (!unit) {
      console.error(
        JSON.stringify({
          blocked: true,
          reason: "demo_unit_missing",
          propertyId: property.id,
        }),
      );
      process.exit(2);
    }

    const holdId = randomUUID();
    const quoteId = randomUUID();
    const snapshotId = randomUUID();
    const bookingId = randomUUID();
    const checkIn = new Date("2027-07-10");
    const checkOut = new Date("2027-07-14");

    await withTenantTransaction(tenant.id, async (tx) => {
      await tx.bookingHold.create({
        data: {
          id: holdId,
          tenantId: tenant.id,
          propertyId: property.id,
          unitId: unit.id,
          checkIn,
          checkOut,
          guestCount: 2,
          status: "converted",
          expiresAt: new Date("2099-01-01"),
        },
      });
      await tx.quote.create({
        data: {
          id: quoteId,
          tenantId: tenant.id,
          holdId,
          propertyId: property.id,
          unitId: unit.id,
          snapshotId,
          snapshot: { currency: "EUR", totalAmount: "1.0000", purpose: "wa_activation_demo" },
          currency: "EUR",
          totalAmount: "1.0000",
          expiresAt: new Date("2099-01-01"),
        },
      });
      await tx.booking.create({
        data: {
          id: bookingId,
          tenantId: tenant.id,
          propertyId: property.id,
          unitId: unit.id,
          holdId,
          quoteId,
          quoteSnapshotId: snapshotId,
          guestName: DEMO_GUEST_NAME,
          guestEmail: DEMO_GUEST_EMAIL,
          guestCount: 2,
          checkIn,
          checkOut,
          status: "confirmed",
          confirmationMode: "manual",
          totalAmount: "1.0000",
          currency: "EUR",
          confirmedAt: new Date(),
        },
      });
    });
    createdBooking = true;
    booking = await prismaAdmin.booking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        id: true,
        guestName: true,
        guestEmail: true,
        guestId: true,
        checkIn: true,
        checkOut: true,
        status: true,
      },
    });
  }

  const jobsBefore = await prismaAdmin.backgroundJob.count({
    where: {
      OR: [
        { jobType: { contains: "messaging" } },
        { payload: { path: ["bookingId"], equals: booking.id } },
      ],
    },
  });

  const outbox = new PrismaOutboxRepository();
  const bookings = new PrismaBookingRepository(outbox);
  const properties = new PrismaPropertyRepository(outbox);
  const profiles = new PrismaBookingMessagingProfileRepository();
  const tokens = new PrismaMessagingContactTokenRepository();
  const platform = new PrismaPlatformMessagingConnectionRepository();
  const opaque = new CryptoOpaqueTokenFactory();
  const ids = new UuidIdGenerator();

  // PermissionChecker unused for systemActor; pass a permissive stub.
  const permissionChecker = {
    hasPermission: () => true,
  };

  const prepare = new PrepareBookingWhatsAppActivationLinkUseCase(
    bookings,
    properties,
    profiles,
    tokens,
    platform,
    opaque,
    permissionChecker as never,
    ids,
  );

  const result = await prepare.execute(
    {
      tenantId: tenant.id,
      bookingId: booking.id,
      systemActor: true,
    },
    {
      userId: "00000000-0000-4000-8000-000000000001",
      role: "admin",
      propertyIds: null,
      isSuperAdmin: true,
    },
  );

  if (result.isFailure) {
    console.error(
      JSON.stringify(
        {
          blocked: true,
          reason: "prepare_failed",
          error: result.getError().message,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const value = result.getValue();

  // Verify hash-only persistence (no plaintext column / raw token not stored)
  await setTenantContext(prisma, tenant.id);
  const tokenRow = await prisma.messagingContactToken.findUnique({
    where: { id: value.tokenId },
  });
  const jobsAfter = await prismaAdmin.backgroundJob.count({
    where: {
      OR: [
        { jobType: { contains: "messaging" } },
        { payload: { path: ["bookingId"], equals: booking.id } },
      ],
    },
  });

  const storedJson = JSON.stringify(tokenRow);
  const hashOnly =
    Boolean(tokenRow) &&
    tokenRow!.tokenHash === value.tokenHash &&
    tokenRow!.status === "active" &&
    tokenRow!.bookingId === booking.id &&
    tokenRow!.expiresAt.getTime() === value.expiresAt.getTime() &&
    !storedJson.includes(value.rawToken);

  const tokenInPrefill = extractContactTokenFromText(
    decodeURIComponent(value.deepLink),
  );
  const deepLinkOk =
    value.deepLink.startsWith(`https://wa.me/${value.displayPhoneDigits}?text=`) &&
    tokenInPrefill === value.rawToken;

  const noNewJobs = jobsAfter === jobsBefore;

  await clearTenantContext(prisma);

  if (!hashOnly || !deepLinkOk || !noNewJobs) {
    console.error(
      JSON.stringify(
        {
          blocked: true,
          reason: "verification_failed",
          hashOnly,
          deepLinkOk,
          noNewJobs,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  // Success report — raw token appears only in the clickable link (stdout once).
  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
        property: {
          id: property.id,
          slug: property.slug,
          name: value.propertyName,
        },
        booking: {
          id: booking.id,
          status: booking.status,
          guestName: value.guestName,
          guestEmail: value.guestEmail,
          guestId: value.guestId,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          createdForDemo: createdBooking,
        },
        token: {
          id: value.tokenId,
          status: "active",
          expiresAt: value.expiresAt.toISOString(),
          hashPersistedOnly: true,
          rawTokenLogged: false,
        },
        whatsapp: {
          displayPhoneDigits: value.displayPhoneDigits,
          platformConnectionId: connection.id,
        },
        workerRequired: false,
        backgroundJobCreated: false,
        emailSent: false,
        inboundNotSimulated: true,
        tokenStillValidForPhoneTest: true,
        waMeDeepLink: value.deepLink,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
