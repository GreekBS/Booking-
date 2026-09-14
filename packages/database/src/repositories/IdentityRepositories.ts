import { createHash, randomBytes } from "crypto";
import { prisma } from "../client";
import {
  User,
  Membership,
  Invitation,
  type IUserRepository,
  type IMembershipRepository,
  type IInvitationRepository,
} from "@hcp/domain";
import {
  PrismaOutboxRepository,
  saveAggregateWithOutbox,
  type TransactionClient,
} from "./OutboxRepository";
import type {
  User as PrismaUser,
  Membership as PrismaMembership,
  Invitation as PrismaInvitation,
  PlatformRole,
  TenantRole,
  MembershipStatus,
} from "@prisma/client";

function mapUser(record: PrismaUser): User {
  return User.reconstitute({
    id: record.id,
    email: record.email,
    passwordHash: record.passwordHash,
    name: record.name,
    platformRole: record.platformRole as "super_admin" | null,
    emailVerified: record.emailVerified,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function mapMembership(record: PrismaMembership): Membership {
  return Membership.reconstitute({
    id: record.id,
    userId: record.userId,
    tenantId: record.tenantId,
    role: record.role as "admin" | "manager",
    propertyIds: record.propertyIds.length > 0 ? record.propertyIds : null,
    status: record.status as MembershipStatus,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function mapInvitation(record: PrismaInvitation): Invitation {
  return Invitation.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    email: record.email,
    role: record.role as "admin" | "manager",
    propertyIds: record.propertyIds.length > 0 ? record.propertyIds : null,
    tokenHash: record.tokenHash,
    expiresAt: record.expiresAt,
    acceptedAt: record.acceptedAt,
    invitedBy: record.invitedById,
    createdAt: record.createdAt,
  });
}

export class PrismaUserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    const props = user.toProps();
    await prisma.user.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        email: props.email,
        passwordHash: props.passwordHash,
        name: props.name,
        platformRole: props.platformRole as PlatformRole | null,
        emailVerified: props.emailVerified,
      },
      update: {
        email: props.email,
        passwordHash: props.passwordHash,
        name: props.name,
        platformRole: props.platformRole as PlatformRole | null,
        emailVerified: props.emailVerified,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    const record = await prisma.user.findUnique({ where: { id } });
    return record ? mapUser(record) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    return record ? mapUser(record) : null;
  }
}

export class PrismaMembershipRepository implements IMembershipRepository {
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async save(membership: Membership): Promise<void> {
    const props = membership.toProps();
    const events = membership.pullDomainEvents();

    await saveAggregateWithOutbox(
      this.outboxRepository,
      events,
      async (tx: TransactionClient) => {
        await tx.membership.upsert({
          where: { id: props.id },
          create: {
            id: props.id,
            userId: props.userId,
            tenantId: props.tenantId,
            role: props.role as TenantRole,
            propertyIds: props.propertyIds ?? [],
            status: props.status as MembershipStatus,
          },
          update: {
            role: props.role as TenantRole,
            propertyIds: props.propertyIds ?? [],
            status: props.status as MembershipStatus,
          },
        });
      },
    );
  }

  async findById(id: string): Promise<Membership | null> {
    const record = await prisma.membership.findUnique({ where: { id } });
    return record ? mapMembership(record) : null;
  }

  async findByUserAndTenant(
    userId: string,
    tenantId: string,
  ): Promise<Membership | null> {
    const record = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    return record ? mapMembership(record) : null;
  }

  async findByTenant(tenantId: string): Promise<Membership[]> {
    const records = await prisma.membership.findMany({ where: { tenantId } });
    return records.map(mapMembership);
  }

  async findByUser(userId: string): Promise<Membership[]> {
    const records = await prisma.membership.findMany({ where: { userId } });
    return records.map(mapMembership);
  }
}

export class PrismaInvitationRepository implements IInvitationRepository {
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async save(invitation: Invitation): Promise<void> {
    const props = invitation.toProps();
    const events = invitation.pullDomainEvents();

    await saveAggregateWithOutbox(
      this.outboxRepository,
      events,
      async (tx: TransactionClient) => {
        await tx.invitation.upsert({
          where: { id: props.id },
          create: {
            id: props.id,
            tenantId: props.tenantId,
            email: props.email,
            role: props.role as TenantRole,
            propertyIds: props.propertyIds ?? [],
            tokenHash: props.tokenHash,
            expiresAt: props.expiresAt,
            acceptedAt: props.acceptedAt,
            invitedById: props.invitedBy,
          },
          update: {
            acceptedAt: props.acceptedAt,
            tokenHash: props.tokenHash,
            expiresAt: props.expiresAt,
          },
        });
      },
    );
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const record = await prisma.invitation.findUnique({ where: { tokenHash } });
    return record ? mapInvitation(record) : null;
  }

  async findById(id: string, tenantId: string): Promise<Invitation | null> {
    const record = await prisma.invitation.findFirst({
      where: { id, tenantId },
    });
    return record ? mapInvitation(record) : null;
  }

  async findPendingByEmailAndTenant(
    email: string,
    tenantId: string,
  ): Promise<Invitation | null> {
    const record = await prisma.invitation.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return record ? mapInvitation(record) : null;
  }

  async findPendingByTenant(tenantId: string): Promise<Invitation[]> {
    const records = await prisma.invitation.findMany({
      where: {
        tenantId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    return records.map(mapInvitation);
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}
