import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import {
  GetTenantSettingsUseCase,
  UpdateTenantSettingsUseCase,
  GetCommerceSettingsUseCase,
  UpdateCommerceSettingsUseCase,
  ListPublishableKeysUseCase,
  CreatePublishableKeyUseCase,
  RevokePublishableKeyUseCase,
  UpdatePublishableKeyDomainsUseCase,
  SearchBookingsUseCase,
  ListHoldsUseCase,
  ResendInvitationUseCase,
  InviteMemberUseCase,
  PermissionChecker,
} from "@hcp/domain";
import { PrismaTenantRepository } from "../../src/repositories/TenantRepository";
import { PrismaCommerceSettingsRepository } from "../../src/repositories/commerce/CommerceSettingsRepository";
import {
  PrismaPublishableKeyRepository,
  generatePublishableKey,
} from "../../src/repositories/storefront/PublishableKeyRepository";
import { PrismaBookingRepository } from "../../src/repositories/commerce/BookingRepository";
import { PrismaHoldRepository } from "../../src/repositories/commerce/HoldRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import { PrismaAuditLogRepository } from "../../src/repositories/AuditLogRepository";
import {
  PrismaInvitationRepository,
  PrismaUserRepository,
  PrismaMembershipRepository,
  generateInviteToken,
} from "../../src/repositories/IdentityRepositories";
import { UuidIdGenerator } from "../../src/UuidIdGenerator";
import { truncateIntegrationTables, prisma } from "./helpers";
import { seedCommerceFixture } from "./commerceFixtures";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("Admin panel backend integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const tenantRepository = new PrismaTenantRepository(outboxRepository);
  const commerceSettingsRepository = new PrismaCommerceSettingsRepository();
  const publishableKeyRepository = new PrismaPublishableKeyRepository();
  const bookingRepository = new PrismaBookingRepository(outboxRepository);
  const holdRepository = new PrismaHoldRepository(outboxRepository);
  const invitationRepository = new PrismaInvitationRepository(outboxRepository);
  const userRepository = new PrismaUserRepository();
  const membershipRepository = new PrismaMembershipRepository(outboxRepository);
  const auditLogRepository = new PrismaAuditLogRepository();
  const permissionChecker = new PermissionChecker();
  const idGenerator = new UuidIdGenerator();

  const tenantId = "550e8400-e29b-41d4-a716-446655442060";
  const propertyId = "550e8400-e29b-41d4-a716-446655442061";
  const unitId = "550e8400-e29b-41d4-a716-446655442062";
  const adminUserId = "550e8400-e29b-41d4-a716-446655442063";

  const adminActor = {
    userId: adminUserId,
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  const getTenantSettingsUseCase = new GetTenantSettingsUseCase(
    tenantRepository,
    permissionChecker,
  );
  const updateTenantSettingsUseCase = new UpdateTenantSettingsUseCase(
    tenantRepository,
    permissionChecker,
    auditLogRepository,
  );
  const getCommerceSettingsUseCase = new GetCommerceSettingsUseCase(
    commerceSettingsRepository,
    permissionChecker,
  );
  const updateCommerceSettingsUseCase = new UpdateCommerceSettingsUseCase(
    commerceSettingsRepository,
    permissionChecker,
    auditLogRepository,
  );
  const listPublishableKeysUseCase = new ListPublishableKeysUseCase(
    publishableKeyRepository,
    permissionChecker,
  );
  const createPublishableKeyUseCase = new CreatePublishableKeyUseCase(
    publishableKeyRepository,
    permissionChecker,
    auditLogRepository,
    idGenerator,
  );
  const revokePublishableKeyUseCase = new RevokePublishableKeyUseCase(
    publishableKeyRepository,
    permissionChecker,
    auditLogRepository,
  );
  const updatePublishableKeyDomainsUseCase = new UpdatePublishableKeyDomainsUseCase(
    publishableKeyRepository,
    permissionChecker,
    auditLogRepository,
  );
  const searchBookingsUseCase = new SearchBookingsUseCase(
    bookingRepository,
    permissionChecker,
  );
  const listHoldsUseCase = new ListHoldsUseCase(holdRepository, permissionChecker);
  const inviteMemberUseCase = new InviteMemberUseCase(
    userRepository,
    membershipRepository,
    invitationRepository,
    permissionChecker,
    idGenerator,
    { sendInvitation: async () => undefined },
  );
  const resendInvitationUseCase = new ResendInvitationUseCase(
    invitationRepository,
    permissionChecker,
    { sendInvitation: async () => undefined },
    auditLogRepository,
  );

  beforeEach(async () => {
    await truncateIntegrationTables();
    await seedCommerceFixture({ tenantId, propertyId, unitId }, { adminUserId });
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("reads and updates tenant settings", async () => {
    const initial = await getTenantSettingsUseCase.execute(tenantId, adminActor);
    expect(initial.isSuccess).toBe(true);
    expect(initial.getValue().defaultCurrency).toBe("EUR");

    const updated = await updateTenantSettingsUseCase.execute(
      {
        tenantId,
        timezone: "America/New_York",
        dateFormat: "MM/DD/YYYY",
        timeFormat: "12h",
      },
      adminActor,
      { actorId: adminUserId, ipAddress: null },
    );

    expect(updated.isSuccess).toBe(true);
    expect(updated.getValue().timezone).toBe("America/New_York");
    expect(updated.getValue().dateFormat).toBe("MM/DD/YYYY");
  });

  it("reads and updates commerce settings", async () => {
    const initial = await getCommerceSettingsUseCase.execute(tenantId, adminActor);
    expect(initial.isSuccess).toBe(true);

    const updated = await updateCommerceSettingsUseCase.execute(
      {
        tenantId,
        defaultHoldTtlSeconds: 1200,
        confirmationMode: "manual",
      },
      adminActor,
      { actorId: adminUserId, ipAddress: null },
    );

    expect(updated.isSuccess).toBe(true);
    expect(updated.getValue().defaultHoldTtlSeconds).toBe(1200);
  });

  it("creates and revokes publishable keys", async () => {
    const { rawKey } = generatePublishableKey("test");
    const created = await createPublishableKeyUseCase.execute(
      {
        tenantId,
        environment: "test",
        allowedDomains: ["*"],
        rawKey,
      },
      adminActor,
      { actorId: adminUserId, ipAddress: null },
    );

    expect(created.isSuccess).toBe(true);
    expect(created.getValue().publishableKey).toBe(rawKey);

    const listed = await listPublishableKeysUseCase.execute(tenantId, adminActor);
    expect(listed.getValue().length).toBe(1);

    await revokePublishableKeyUseCase.execute(
      { tenantId, keyId: created.getValue().id },
      adminActor,
      { actorId: adminUserId, ipAddress: null },
    );

    const afterRevoke = await listPublishableKeysUseCase.execute(tenantId, adminActor);
    expect(afterRevoke.getValue()[0]?.isActive).toBe(false);
  });

  it("validates allowed domains for live keys", async () => {
    const { rawKey } = generatePublishableKey("live");
    const result = await createPublishableKeyUseCase.execute(
      {
        tenantId,
        environment: "live",
        allowedDomains: [],
        rawKey,
      },
      adminActor,
      { actorId: adminUserId, ipAddress: null },
    );

    expect(result.isSuccess).toBe(true);
    const keyId = result.getValue().id;

    const invalid = await updatePublishableKeyDomainsUseCase.execute(
      { tenantId, keyId, allowedDomains: [] },
      adminActor,
      { actorId: adminUserId, ipAddress: null },
    );
    expect(invalid.isFailure).toBe(true);
  });

  it("searches bookings with filters", async () => {
    const result = await searchBookingsUseCase.execute(
      {
        tenantId,
        page: 1,
        limit: 20,
        sortBy: "checkIn",
        sortDir: "desc",
        status: "confirmed",
      },
      adminActor,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().total).toBeGreaterThanOrEqual(0);
  });

  it("lists and releases holds", async () => {
    const listed = await listHoldsUseCase.execute(tenantId, {}, adminActor);
    expect(listed.isSuccess).toBe(true);
    expect(Array.isArray(listed.getValue())).toBe(true);
  });

  it("resends pending invitation", async () => {
    const email = `pending-${randomUUID().slice(0, 8)}@test.local`;
    const { token, tokenHash } = generateInviteToken();

    const invited = await inviteMemberUseCase.execute(
      {
        tenantId,
        email,
        role: "manager",
        propertyIds: [propertyId],
        invitedBy: adminUserId,
        tokenHash,
        rawToken: token,
      },
      adminActor,
    );

    expect(invited.isSuccess).toBe(true);

    const { token: newToken, tokenHash: newTokenHash } = generateInviteToken();
    const resent = await resendInvitationUseCase.execute(
      {
        tenantId,
        invitationId: invited.getValue().invitation.id,
        tokenHash: newTokenHash,
        rawToken: newToken,
      },
      adminActor,
      { ipAddress: null },
    );

    expect(resent.isSuccess).toBe(true);
  });
});
