import { ConflictError } from "../../shared/errors/DomainError";

export type ChannelConnectionStatus =
  | "draft"
  | "pending_auth"
  | "active"
  | "paused"
  | "error"
  | "disconnected";

export class ChannelConnectionStateMachine {
  static assertCanAttachCredentials(status: ChannelConnectionStatus): void {
    if (status === "draft" || status === "error") {
      return;
    }
    throw new ConflictError(`Cannot attach credentials in status: ${status}`);
  }

  static assertCanActivate(status: ChannelConnectionStatus): void {
    if (status === "pending_auth" || status === "error") {
      return;
    }
    throw new ConflictError(`Cannot activate connection in status: ${status}`);
  }

  static assertCanPause(status: ChannelConnectionStatus): void {
    if (status === "active") {
      return;
    }
    throw new ConflictError(`Cannot pause connection in status: ${status}`);
  }

  static assertCanResume(status: ChannelConnectionStatus): void {
    if (status === "paused") {
      return;
    }
    throw new ConflictError(`Cannot resume connection in status: ${status}`);
  }

  static assertCanMarkError(status: ChannelConnectionStatus): void {
    if (status === "disconnected") {
      throw new ConflictError("Cannot mark error on disconnected connection");
    }
  }

  static assertCanMutate(status: ChannelConnectionStatus): void {
    if (status === "disconnected") {
      throw new ConflictError("Connection is disconnected");
    }
  }
}
