import { ConflictError } from "../../shared/errors/DomainError";

export type ExternalReservationLinkStatus = "linked" | "stale" | "conflict" | "archived";

export class ExternalReservationLinkStateMachine {
  static assertCanMarkSynced(status: ExternalReservationLinkStatus): void {
    if (status === "linked" || status === "stale" || status === "conflict") {
      return;
    }
    throw new ConflictError(`Cannot mark synced in status: ${status}`);
  }

  static assertCanMarkStale(status: ExternalReservationLinkStatus): void {
    if (status === "linked" || status === "stale") {
      return;
    }
    throw new ConflictError(`Cannot mark stale in status: ${status}`);
  }

  static assertCanMarkConflict(status: ExternalReservationLinkStatus): void {
    if (status === "linked" || status === "stale") {
      return;
    }
    throw new ConflictError(`Cannot mark conflict in status: ${status}`);
  }

  static assertCanMutate(status: ExternalReservationLinkStatus): void {
    if (status === "archived") {
      throw new ConflictError("External reservation link is archived");
    }
  }

  static assertCanArchive(status: ExternalReservationLinkStatus): void {
    if (status === "archived") {
      throw new ConflictError("External reservation link is already archived");
    }
  }
}
