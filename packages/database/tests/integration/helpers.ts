import { prisma, clearTenantContext, setTenantContext } from "../../src/client";
import { assertNotTalosProductionDatabase } from "../../src/safety/databaseTargetGuard";

export async function truncateIntegrationTables(): Promise<void> {
  assertNotTalosProductionDatabase(
    process.env.DATABASE_URL,
    "truncateIntegrationTables",
  );
  // Clear RLS tenant GUC so deletes are not filtered to a single tenant.
  await clearTenantContext(prisma);
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
  await prisma.user.deleteMany({
    where: { email: { contains: "@integration.test" } },
  });
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

export { prisma, setTenantContext, clearTenantContext };
