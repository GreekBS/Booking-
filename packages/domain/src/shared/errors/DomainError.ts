export abstract class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, "NOT_FOUND");
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}

/** Optional machine-readable conflict classification for CAS / concurrency failures. */
export type ConflictType =
  | "semantic_epoch_conflict"
  | "lifecycle_status_conflict"
  | "credential_conflict"
  | string;

export class ConflictError extends DomainError {
  constructor(
    message: string,
    readonly conflictType?: ConflictType,
  ) {
    super(message, "CONFLICT");
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Unauthorized") {
    super(message, "UNAUTHORIZED");
  }
}

/** Same durable command key with a materially different fingerprint. */
export class IdempotencyConflictError extends DomainError {
  constructor(message: string) {
    super(message, "IDEMPOTENCY_CONFLICT");
  }
}

/** Persisted committed receipt cannot be strictly hydrated. */
export class PersistenceCorruptionError extends DomainError {
  constructor(message: string) {
    super(message, "PERSISTENCE_CORRUPTION");
  }
}

/**
 * Rejected because the transition would leave zero platform Super Admins.
 * Enforced at the transactional platform-admin mutation boundary — not by User alone.
 */
export class LastSuperAdminProtectionError extends DomainError {
  constructor(
    message = "Cannot remove the last platform Super Admin",
  ) {
    super(message, "LAST_SUPER_ADMIN");
  }
}

/**
 * Generic User persistence attempted to change platformRole.
 * Platform authority changes must use IPlatformSuperAdminMutation.
 */
export class PlatformRoleDriftError extends DomainError {
  constructor(
    message = "platformRole cannot be changed via generic User persistence; use IPlatformSuperAdminMutation",
  ) {
    super(message, "PLATFORM_ROLE_DRIFT");
  }
}
