import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  User,
  Membership,
  Invitation,
  Tenant,
  TenantSettings,
} from "@hcp/domain";
import {
  PrismaUserRepository,
  PrismaMembershipRepository,
  PrismaInvitationRepository,
  hashToken,
} from "../../src/repositories/IdentityRepositories";
import { PrismaTenantRepository } from "../../src/repositories/TenantRepository";
import { PrismaOutboxRepository } from "../../src/repositories/OutboxRepository";
import {
  truncateIntegrationTables,
  countOutboxForAggregate,
  prisma,
} from "./helpers";
import { runIntegration } from "./integrationGate";


runIntegration("IdentityRepository integration", () => {
  const outboxRepository = new PrismaOutboxRepository();
  const tenantRepository = new PrismaTenantRepository(outboxRepository);
  const userRepository = new PrismaUserRepository();
  const membershipRepository = new PrismaMembershipRepository(outboxRepository);
  const invitationRepository = new PrismaInvitationRepository(outboxRepository);

  const tenantId = "550e8400-e29b-41d4-a716-446655440020";
  const userId = "550e8400-e29b-41d4-a716-446655440021";

  beforeEach(async () => {
    await truncateIntegrationTables();
    await tenantRepository.save(
      Tenant.create({
        id: tenantId,
        name: "Identity Tenant",
        slug: "int-identity-tenant",
        settings: TenantSettings.create(),
      }),
    );
  });

  afterAll(async () => {
    await truncateIntegrationTables();
    await prisma.$disconnect();
  });

  it("persists users, memberships and invitations", async () => {
    const user = User.create({
      id: userId,
      email: "admin@integration.test",
      name: "Admin",
      passwordHash: "hash",
    });
    await userRepository.save(user);

    const membership = Membership.create({
      id: "550e8400-e29b-41d4-a716-446655440022",
      userId,
      tenantId,
      role: "admin",
    });
    await membershipRepository.save(membership);

    expect(await userRepository.findByEmail("admin@integration.test")).not.toBeNull();
    expect(await membershipRepository.findByUserAndTenant(userId, tenantId)).not.toBeNull();

    const invitation = Invitation.create({
      id: "550e8400-e29b-41d4-a716-446655440023",
      tenantId,
      email: "manager@integration.test",
      role: "manager",
      tokenHash: hashToken("invite-token"),
      expiresAt: new Date(Date.now() + 86_400_000),
      invitedBy: userId,
    });
    await invitationRepository.save(invitation);

    expect(
      await invitationRepository.findPendingByEmailAndTenant(
        "manager@integration.test",
        tenantId,
      ),
    ).not.toBeNull();
  });

  it("persists exactly one outbox event on invite member", async () => {
    const invitationId = "550e8400-e29b-41d4-a716-446655440024";
    const invitation = Invitation.create({
      id: invitationId,
      tenantId,
      email: "invite@integration.test",
      role: "manager",
      tokenHash: hashToken("token-2"),
      expiresAt: new Date(Date.now() + 86_400_000),
      invitedBy: userId,
    });

    await userRepository.save(
      User.create({
        id: userId,
        email: "inviter@integration.test",
        name: "Inviter",
      }),
    );
    await invitationRepository.save(invitation);

    expect(await countOutboxForAggregate(invitationId)).toBe(1);
    const event = await prisma.outboxEvent.findFirst({ where: { aggregateId: invitationId } });
    expect(event?.eventType).toBe("MemberInvited");
  });
});
