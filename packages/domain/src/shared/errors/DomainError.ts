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
