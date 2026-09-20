import { Result } from "../../shared/kernel/Result";
import type {
  IPlatformOperationsRepository,
  PlatformOperationsHealth,
} from "../ports/IPlatformOperationsRepository";

export class GetPlatformOperationsHealthUseCase {
  constructor(private readonly operations: IPlatformOperationsRepository) {}

  async execute(): Promise<Result<PlatformOperationsHealth, Error>> {
    try {
      return Result.ok(await this.operations.getHealthSummary());
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
