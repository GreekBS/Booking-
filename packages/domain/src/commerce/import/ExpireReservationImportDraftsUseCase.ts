import { Result } from "../../shared/kernel/Result";
import type { IReservationImportRepository } from "./IReservationImportRepository";

export class ExpireReservationImportDraftsUseCase {
  constructor(private readonly imports: IReservationImportRepository) {}

  async execute(
    now: Date = new Date(),
    limit = 100,
  ): Promise<Result<{ expiredBatches: number; discardedRows: number }, Error>> {
    try {
      const result = await this.imports.expireDrafts(now, limit);
      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
