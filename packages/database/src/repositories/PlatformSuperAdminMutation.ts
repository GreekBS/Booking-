import { prisma } from "../client";
import {
  User,
  NotFoundError,
  LastSuperAdminProtectionError,
  type IPlatformSuperAdminMutation,
  type PlatformSuperAdminMutationCommand,
} from "@hcp/domain";
import type { PlatformRole, Prisma, PrismaClient } from "@prisma/client";

/**
 * Stable transaction-scoped advisory lock for platform Super Admin mutations.
 *
 * Key pair is fixed so every Node/Vercel instance contends on the same lock.
 * `pg_advisory_xact_lock` is released automatically on COMMIT/ROLLBACK.
 *
 * Why: prevent concurrent demotions from observing count=2 and both succeeding
 * (classic TOCTOU → 0 Super Admins).
 *
 * Scope: application-supported platform-authority mutations only. Direct DBA/SQL
 * is outside this guarantee. Future deletion of a Super Admin MUST use this same
 * lock + recount (extend this port; do not delete via generic repositories).
 *
 * Bootstrap / recovery `0 → 1`: use `action: "promote"` (or controlled ops tooling
 * such as the dev seed). Do NOT use IUserRepository.save as an SA creation hatch.
 *
 * Rejected-attempt audit: AuditLog rows written inside this transaction are rolled
 * back with the mutation. Durable recording of rejected last-SA attempts would need
 * a separate committed transaction (or out-of-band log) — not implemented here.
 * Successful promote/demote audit remains atomic with the mutation.
 */
export const PLATFORM_SUPER_ADMIN_ADVISORY_LOCK_KEY1 = 0x48435053; // "HCPS"
export const PLATFORM_SUPER_ADMIN_ADVISORY_LOCK_KEY2 = 0x00005341; // "SA"

function mapUser(record: {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string;
  platformRole: PlatformRole | null;
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): User {
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

export class PrismaPlatformSuperAdminMutation
  implements IPlatformSuperAdminMutation
{
  constructor(private readonly db: PrismaClient = prisma) {}

  async execute(command: PlatformSuperAdminMutationCommand): Promise<void> {
    // Remote pooler latency + advisory-lock wait can exceed Prisma's 5s default.
    await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            ${PLATFORM_SUPER_ADMIN_ADVISORY_LOCK_KEY1}::int,
            ${PLATFORM_SUPER_ADMIN_ADVISORY_LOCK_KEY2}::int
          )
        `;

        const record = await tx.user.findUnique({
          where: { id: command.targetUserId },
        });
        if (!record) {
          throw new NotFoundError("User", command.targetUserId);
        }

        const actor = await tx.user.findUnique({
          where: { id: command.actorId },
          select: { id: true },
        });
        if (!actor) {
          throw new NotFoundError("User", command.actorId);
        }

        const countBefore = await tx.user.count({
          where: { platformRole: "super_admin" },
        });

        const user = mapUser(record);

        if (command.action === "promote") {
          user.promoteToSuperAdmin();
        } else {
          if (user.isSuperAdmin && countBefore <= 1) {
            throw new LastSuperAdminProtectionError();
          }
          user.demoteFromSuperAdmin();
        }

        const props = user.toProps();
        await tx.user.update({
          where: { id: props.id },
          data: {
            platformRole: props.platformRole as PlatformRole | null,
            updatedAt: props.updatedAt,
          },
        });

        const countAfter = await tx.user.count({
          where: { platformRole: "super_admin" },
        });
        if (countAfter < 1) {
          throw new LastSuperAdminProtectionError();
        }

        const actionName =
          command.action === "promote"
            ? "platform.super_admin_promoted"
            : "platform.super_admin_demoted";

        await tx.auditLog.create({
          data: {
            tenantId: null,
            actorId: command.actorId,
            action: actionName,
            resourceType: "User",
            resourceId: command.targetUserId,
            metadata: {
              action: command.action,
              targetUserId: command.targetUserId,
            } as Prisma.InputJsonValue,
            ipAddress: command.ipAddress ?? null,
          },
        });
      },
      { maxWait: 20_000, timeout: 60_000 },
    );
  }
}
