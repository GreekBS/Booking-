import {
  prisma,
  clearTenantContext,
  setTenantContext,
  withTenantTransaction,
} from "../../src/client";
import { assertNotTalosProductionDatabase } from "../../src/safety/databaseTargetGuard";

export async function truncateIntegrationTables(): Promise<void> {
  assertNotTalosProductionDatabase(
    process.env.DATABASE_URL,
    "truncateIntegrationTables",
  );
  // Clear RLS tenant GUC so deletes are not filtered to a single tenant.
  await clearTenantContext(prisma);

  // FORCE RLS: unscoped deleteMany is often a no-op. Clean int-* tenants under GUC first.
  const intTenants = await prisma.tenant.findMany({
    where: { slug: { startsWith: "int-" } },
    select: { id: true },
  });
  for (const { id: tenantId } of intTenants) {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.booking.deleteMany({ where: { tenantId } });
      await tx.guest.deleteMany({ where: { tenantId } });
      await tx.quote.deleteMany({ where: { tenantId } });
      await tx.bookingHold.deleteMany({ where: { tenantId } });
      await tx.unitCalendarBlock.deleteMany({ where: { tenantId } });
      await tx.rateDowModifier.deleteMany({ where: { tenantId } });
      await tx.rateSeason.deleteMany({ where: { tenantId } });
      await tx.ratePlan.deleteMany({ where: { tenantId } });
      await tx.unitAvailabilityRule.deleteMany({ where: { tenantId } });
      await tx.tenantCommerceSettings.deleteMany({ where: { tenantId } });
      await tx.outboxEvent.deleteMany({ where: { tenantId } });
      await tx.propertyAmenity.deleteMany({
        where: { property: { tenantId } },
      });
      await tx.unit.deleteMany({ where: { tenantId } });
      await tx.property.deleteMany({ where: { tenantId } });
      await tx.invitation.deleteMany({ where: { tenantId } });
      await tx.membership.deleteMany({ where: { tenantId } });
    });
  }

  await prisma.channelSemanticTransitionCommand.deleteMany();
  await prisma.channelSecretRecord.deleteMany();
  await prisma.channelInventoryReconciliation.deleteMany();
  await prisma.channelPollCursor.deleteMany();
  await prisma.channelInboxItem.deleteMany();
  await prisma.externalReservationLink.deleteMany();
  await prisma.channelListingMapping.deleteMany();
  await prisma.channelConnection.deleteMany();
  await prisma.storefrontIdempotencyRecord.deleteMany();
  await prisma.tenantPublishableKey.deleteMany();
  await prisma.paymentRecord.deleteMany();
  await prisma.folioLine.deleteMany();
  await prisma.folio.deleteMany();
  await prisma.customerBillingProfile.deleteMany();
  await prisma.businessFiscalProfile.deleteMany();
  await prisma.taxRule.deleteMany({ where: { tenantId: { not: null } } });
  await prisma.booking.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.bookingHold.deleteMany();
  await prisma.unitCalendarBlock.deleteMany();
  await prisma.rateDowModifier.deleteMany();
  await prisma.rateSeason.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.unitAvailabilityRule.deleteMany();
  await prisma.tenantCommerceSettings.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.backgroundJob.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.propertyAmenity.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.property.deleteMany();
  await prisma.amenity.deleteMany({ where: { tenantId: { not: null } } });
  await prisma.invitation.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  // Shared demo DB + FORCE RLS can leave invitations invisible to unscoped
  // deleteMany while still enforcing invited_by FK against integration users.
  const integrationUsers = await prisma.user.findMany({
    where: { email: { contains: "@integration.test" } },
    select: { id: true },
  });
  if (integrationUsers.length > 0) {
    const integrationUserIds = integrationUsers.map((u) => u.id);
    try {
      await prisma.invitation.deleteMany({
        where: { invitedById: { in: integrationUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: integrationUserIds } },
      });
    } catch {
      // Best-effort on shared demo: do not fail the suite when RLS hides
      // invitation rows that still block user deletes.
    }
  }
  await prisma.tenant.deleteMany({
    where: { slug: { startsWith: "int-" } },
  });
}

export async function countOutboxForAggregate(aggregateId: string): Promise<number> {
  return prisma.outboxEvent.count({ where: { aggregateId } });
}

export async function verifyRlsPoliciesActive(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string; rowsecurity: boolean }>>`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'properties', 'units', 'memberships', 'invitations',
        'tenant_commerce_settings', 'unit_availability_rules', 'rate_plans',
        'rate_seasons', 'rate_dow_modifiers', 'unit_calendar_blocks',
        'booking_holds', 'quotes', 'bookings', 'payment_records',
        'tenant_publishable_keys', 'storefront_idempotency_records',
        'channel_semantic_transition_commands', 'channel_poll_cursors',
        'folios', 'folio_lines', 'guests'
      )
  `;
  return rows.length === 21 && rows.every((row) => row.rowsecurity === true);
}

/** CleaningLocation V1 tables — FORCE RLS expected after migration 20260928010000. */
export async function verifyCleaningLocationRlsPoliciesActive(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string; rowsecurity: boolean }>>`
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'cleaning_locations',
        'cleaning_location_statuses',
        'cleaning_location_qr_access'
      )
  `;
  return rows.length === 3 && rows.every((row) => row.rowsecurity === true);
}

export { prisma, setTenantContext, clearTenantContext, withTenantTransaction };
