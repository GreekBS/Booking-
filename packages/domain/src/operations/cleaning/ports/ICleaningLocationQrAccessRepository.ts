import type { CleaningLocationQrAccessRecord } from "../domain/CleaningLocationTypes";

export interface IssueCleaningLocationQrCommand {
  tenantId: string;
  propertyId: string;
  cleaningLocationId: string;
  /** SHA-256 hex of the opaque token. The plaintext never reaches this port. */
  tokenHash: string;
  /** AES-GCM sealed raw token for authorized recovery. Required on new mints. */
  tokenCiphertext: Uint8Array;
  tokenKeyVersion: number;
  /** Revoke the current ACTIVE row first (rotation) instead of failing. */
  rotate: boolean;
  now?: Date;
}

export interface ICleaningLocationQrAccessRepository {
  findActiveByLocation(
    tenantId: string,
    cleaningLocationId: string,
  ): Promise<CleaningLocationQrAccessRecord | null>;

  /** Tenant-scoped resolve — a token only resolves inside its owning tenant. */
  findByTokenHash(
    tenantId: string,
    tokenHash: string,
  ): Promise<CleaningLocationQrAccessRecord | null>;

  /**
   * Issue a new ACTIVE token for the location in one transaction.
   * When `rotate` is false and an ACTIVE row already exists, returns it
   * unchanged with `issued: false` so the caller can discard the new token.
   */
  issue(
    command: IssueCleaningLocationQrCommand,
  ): Promise<{ record: CleaningLocationQrAccessRecord; issued: boolean }>;
}
