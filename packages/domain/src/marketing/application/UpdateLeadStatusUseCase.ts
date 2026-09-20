import { Result } from "../../shared/kernel/Result";
import { NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import type { Lead } from "../domain/Lead";
import type { LeadStatus } from "../domain/LeadTypes";
import { LEAD_STATUSES } from "../domain/LeadTypes";
import type { ILeadRepository } from "../ports/ILeadRepository";

export interface UpdateLeadStatusCommand {
  leadId: string;
  status: LeadStatus;
}

export class UpdateLeadStatusUseCase {
  constructor(private readonly leadRepository: ILeadRepository) {}

  async execute(
    command: UpdateLeadStatusCommand,
  ): Promise<Result<Lead, Error>> {
    try {
      const leadId = command.leadId?.trim();
      if (!leadId) {
        return Result.fail(new ValidationError("leadId is required"));
      }
      if (!(LEAD_STATUSES as readonly string[]).includes(command.status)) {
        return Result.fail(new ValidationError("Invalid lead status"));
      }

      const existing = await this.leadRepository.findById(leadId);
      if (!existing) {
        return Result.fail(new NotFoundError("Lead", leadId));
      }

      const updated = await this.leadRepository.updateStatus(
        leadId,
        command.status,
      );
      if (!updated) {
        return Result.fail(new NotFoundError("Lead", leadId));
      }
      return Result.ok(updated);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
