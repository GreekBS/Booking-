import { Result } from "../../shared/kernel/Result";
import type {
  IPlatformSuperAdminMutation,
  PlatformSuperAdminMutationAction,
} from "../ports/IPlatformSuperAdminMutation";

export interface ChangePlatformSuperAdminRoleCommand {
  targetUserId: string;
  actorId: string;
  action: PlatformSuperAdminMutationAction;
  ipAddress?: string | null;
}

/**
 * Application boundary for explicit platform Super Admin promote/demote.
 * Authorization (is the actor allowed?) is the caller's responsibility;
 * this use case enforces only the transactional last-SA invariant via the port.
 */
export class ChangePlatformSuperAdminRoleUseCase {
  constructor(private readonly mutation: IPlatformSuperAdminMutation) {}

  async execute(
    command: ChangePlatformSuperAdminRoleCommand,
  ): Promise<Result<void, Error>> {
    try {
      await this.mutation.execute({
        targetUserId: command.targetUserId,
        actorId: command.actorId,
        action: command.action,
        ipAddress: command.ipAddress ?? null,
      });
      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
