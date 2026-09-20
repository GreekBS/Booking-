/**
 * Protected platform Super Admin role mutations.
 *
 * ALL transitions that change `users.platform_role` to/from `super_admin`, and any
 * future deletion of a user who currently is Super Admin, MUST go through this
 * boundary so the advisory-locked invariant `COUNT(super_admin) >= 1` is preserved
 * after bootstrap.
 *
 * Do NOT change platformRole via IUserRepository.save.
 * Do NOT delete a Super Admin via raw Prisma outside this (or a future delete
 * method on this port that uses the same lock + recount).
 */
export type PlatformSuperAdminMutationAction = "promote" | "demote";

export interface PlatformSuperAdminMutationCommand {
  /** User whose platformRole will change. */
  targetUserId: string;
  /** Actor recorded on the success AuditLog (must be a real users.id). */
  actorId: string;
  action: PlatformSuperAdminMutationAction;
  ipAddress?: string | null;
}

export interface IPlatformSuperAdminMutation {
  /**
   * Atomically applies promote/demote under pg_advisory_xact_lock,
   * enforces last-SA protection, and appends a success audit row.
   *
   * Throws LastSuperAdminProtectionError when demotion would yield 0 SAs.
   * Throws NotFoundError / ValidationError for invalid targets/transitions.
   */
  execute(command: PlatformSuperAdminMutationCommand): Promise<void>;
}
