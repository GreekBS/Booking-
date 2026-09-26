import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type {
  HousekeepingTodayBoard,
  IHousekeepingTodayQuery,
} from "../ports/IHousekeepingTodayQuery";
import { resolveTaskListScope } from "./taskAccess";

export class GetHousekeepingTodayUseCase {
  constructor(
    private readonly query: IHousekeepingTodayQuery,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; propertyId: string },
    actor: ActorContext,
  ): Promise<Result<HousekeepingTodayBoard, Error>> {
    try {
      const propertyId = input.propertyId.trim();
      if (!propertyId) {
        return Result.fail(new ValidationError("propertyId is required"));
      }

      const scope = resolveTaskListScope(
        this.permissionChecker,
        actor,
        input.tenantId,
        { propertyId },
      );
      if (scope === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const board = await this.query.getTodayBoard({
        tenantId: input.tenantId,
        propertyId,
      });
      if (!board) {
        return Result.fail(new ValidationError("Property not found"));
      }
      return Result.ok(board);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
