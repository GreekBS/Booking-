import type { UnitQrAccessRecord } from "../domain/CleaningTypes";

export interface IssueUnitQrCommand {
  tenantId: string;
  propertyId: string;
  unitId: string;
  /** SHA-256 hex of the opaque token. The plaintext never reaches this port. */
  tokenHash: string;
  /** Revoke the current ACTIVE row first (rotation) instead of failing. */
  rotate: boolean;
  now?: Date;
}

export interface IUnitQrAccessRepository {
  findActiveByUnit(
    tenantId: string,
    unitId: string,
  ): Promise<UnitQrAccessRecord | null>;

  /** Tenant-scoped resolve — a token only resolves inside its owning tenant. */
  findActiveByTokenHash(
    tenantId: string,
    tokenHash: string,
  ): Promise<UnitQrAccessRecord | null>;

  /**
   * Issue a new ACTIVE token for the unit in one transaction.
   * When `rotate` is false and an ACTIVE row already exists, returns it
   * unchanged with `issued: false` so the caller can discard the new token.
   */
  issue(
    command: IssueUnitQrCommand,
  ): Promise<{ record: UnitQrAccessRecord; issued: boolean }>;
}
