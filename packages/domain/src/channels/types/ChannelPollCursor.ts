import { ValidationError } from "../../shared/errors/DomainError";

export interface ChannelPollCursor {
  tenantId: string;
  connectionId: string;
  /** Opaque provider-neutral persistence payload. */
  payload: string;
  /** Positive monotonic version for compare-and-swap advances. */
  version: number;
  /** Semantic epoch observed when this cursor was committed. */
  semanticConfigVersion: number;
  updatedAt: Date;
}

export interface PersistedChannelPollCursor {
  tenantId: unknown;
  connectionId: unknown;
  payload: unknown;
  version: unknown;
  semanticConfigVersion: unknown;
  updatedAt: unknown;
}

function parseIdentity(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Invalid persisted channel poll cursor ${field}`);
  }
  return value;
}

function parsePositiveVersion(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ValidationError(`Invalid persisted channel poll cursor ${field}`);
  }
  return value;
}

/**
 * Strict hydration boundary for durable cursor rows. No persisted value is
 * defaulted or interpreted.
 */
export function hydrateChannelPollCursor(
  persisted: PersistedChannelPollCursor,
): ChannelPollCursor {
  if (typeof persisted.payload !== "string") {
    throw new ValidationError("Invalid persisted channel poll cursor payload");
  }

  const updatedAt =
    persisted.updatedAt instanceof Date
      ? new Date(persisted.updatedAt)
      : new Date(String(persisted.updatedAt));
  if (Number.isNaN(updatedAt.getTime())) {
    throw new ValidationError("Invalid persisted channel poll cursor updatedAt");
  }

  return {
    tenantId: parseIdentity(persisted.tenantId, "tenantId"),
    connectionId: parseIdentity(persisted.connectionId, "connectionId"),
    payload: persisted.payload,
    version: parsePositiveVersion(persisted.version, "version"),
    semanticConfigVersion: parsePositiveVersion(
      persisted.semanticConfigVersion,
      "semanticConfigVersion",
    ),
    updatedAt,
  };
}
