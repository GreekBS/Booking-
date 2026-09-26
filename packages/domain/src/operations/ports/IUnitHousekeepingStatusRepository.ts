import type { UnitHousekeepingStatus } from "../domain/UnitHousekeepingStatus";
import type { UnitHousekeepingStatusValue } from "../domain/TaskTypes";

export interface IUnitHousekeepingStatusRepository {
  save(status: UnitHousekeepingStatus): Promise<void>;
  saveWithExpectedVersion(
    status: UnitHousekeepingStatus,
    expectedVersion: number,
  ): Promise<void>;
  findByUnitId(
    tenantId: string,
    unitId: string,
  ): Promise<UnitHousekeepingStatus | null>;
  /**
   * Insert CLEAN if missing (idempotent). Returns current row.
   */
  ensureInitialized(input: {
    tenantId: string;
    propertyId: string;
    unitId: string;
  }): Promise<UnitHousekeepingStatus>;
  listByProperty(input: {
    tenantId: string;
    propertyId: string;
    status?: UnitHousekeepingStatusValue;
  }): Promise<UnitHousekeepingStatus[]>;
}
