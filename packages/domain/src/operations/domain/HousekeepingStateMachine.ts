import { ConflictError } from "../../shared/errors/DomainError";
import type { UnitHousekeepingStatusValue } from "./TaskTypes";

const ALLOWED: Record<
  UnitHousekeepingStatusValue,
  ReadonlySet<UnitHousekeepingStatusValue>
> = {
  CLEAN: new Set(["DIRTY"]),
  DIRTY: new Set(["CLEAN"]),
};

export const HousekeepingStateMachine = {
  assertCanTransition(
    from: UnitHousekeepingStatusValue,
    to: UnitHousekeepingStatusValue,
  ): void {
    if (from === to) {
      return;
    }
    if (!ALLOWED[from].has(to)) {
      throw new ConflictError(
        `Cannot transition housekeeping from ${from} to ${to}`,
      );
    }
  },

  /** Idempotent: same status is a no-op success. */
  isNoOp(
    from: UnitHousekeepingStatusValue,
    to: UnitHousekeepingStatusValue,
  ): boolean {
    return from === to;
  },
};
