import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { Lead } from "../domain/Lead";
import type { ILeadRepository } from "../ports/ILeadRepository";

export interface ListLeadsCommand {
  page?: number;
  limit?: number;
}

export interface ListLeadsPage {
  data: Lead[];
  total: number;
  page: number;
  limit: number;
}

export class ListLeadsUseCase {
  constructor(private readonly leadRepository: ILeadRepository) {}

  async execute(
    command: ListLeadsCommand = {},
  ): Promise<Result<ListLeadsPage, Error>> {
    try {
      const page = Math.max(1, command.page ?? 1);
      const limit = Math.min(100, Math.max(1, command.limit ?? 50));
      if (!Number.isFinite(page) || !Number.isFinite(limit)) {
        return Result.fail(new ValidationError("Invalid pagination"));
      }

      const result = await this.leadRepository.list({
        page,
        limit,
        prioritizeOperational: true,
      });

      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
