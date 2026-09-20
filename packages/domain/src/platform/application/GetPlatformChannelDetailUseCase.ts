import { Result } from "../../shared/kernel/Result";
import { NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import type {
  IPlatformOperationsRepository,
  PlatformChannelConnectionDetail,
} from "../ports/IPlatformOperationsRepository";

export class GetPlatformChannelDetailUseCase {
  constructor(private readonly operations: IPlatformOperationsRepository) {}

  async execute(
    tenantId: string,
    connectionId: string,
  ): Promise<Result<PlatformChannelConnectionDetail, Error>> {
    try {
      const tid = tenantId?.trim();
      const cid = connectionId?.trim();
      if (!tid || !cid) {
        return Result.fail(
          new ValidationError("tenantId and connectionId are required"),
        );
      }
      const detail = await this.operations.getConnectionDetail(tid, cid);
      if (!detail) {
        return Result.fail(new NotFoundError("ChannelConnection", cid));
      }
      return Result.ok(detail);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
