import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { Lead } from "../domain/Lead";
import type { LeadSource, LeadStatus } from "../domain/LeadTypes";
import { LEAD_SOURCES, LEAD_STATUSES } from "../domain/LeadTypes";
import type { ILeadRepository } from "../ports/ILeadRepository";

export interface ListLeadsCommand {
  page?: number;
  limit?: number;
  status?: LeadStatus;
  demoRequested?: boolean;
  source?: LeadSource;
  prioritizeOperational?: boolean;
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

      if (
        command.status != null &&
        !(LEAD_STATUSES as readonly string[]).includes(command.status)
      ) {
        return Result.fail(new ValidationError("Invalid lead status filter"));
      }
      if (
        command.source != null &&
        !(LEAD_SOURCES as readonly string[]).includes(command.source)
      ) {
        return Result.fail(new ValidationError("Invalid lead source filter"));
      }

      const result = await this.leadRepository.list({
        page,
        limit,
        prioritizeOperational: command.prioritizeOperational ?? true,
        status: command.status,
        demoRequested: command.demoRequested,
        source: command.source,
      });

      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
