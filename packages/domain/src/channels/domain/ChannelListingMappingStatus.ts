import { ConflictError } from "../../shared/errors/DomainError";

export type ChannelListingMappingStatus =
  | "active"
  | "paused"
  | "unmapped"
  | "error"
  | "archived";

export class ChannelListingMappingStateMachine {
  static assertCanPause(status: ChannelListingMappingStatus): void {
    if (status === "active") {
      return;
    }
    throw new ConflictError(`Cannot pause listing mapping in status: ${status}`);
  }

  static assertCanResume(status: ChannelListingMappingStatus): void {
    if (status === "paused") {
      return;
    }
    throw new ConflictError(`Cannot resume listing mapping in status: ${status}`);
  }

  static assertCanMarkUnmapped(status: ChannelListingMappingStatus): void {
    if (status === "archived") {
      throw new ConflictError("Cannot mark unmapped on archived listing mapping");
    }
    if (status === "unmapped") {
      throw new ConflictError("Listing mapping is already unmapped");
    }
  }

  static assertCanMarkError(status: ChannelListingMappingStatus): void {
    if (status === "archived") {
      throw new ConflictError("Cannot mark error on archived listing mapping");
    }
  }

  static assertCanMutate(status: ChannelListingMappingStatus): void {
    if (status === "archived") {
      throw new ConflictError("Listing mapping is archived");
    }
  }

  static assertCanArchive(status: ChannelListingMappingStatus): void {
    if (status === "archived") {
      throw new ConflictError("Listing mapping is already archived");
    }
  }
}
