import { Result } from "../../shared/kernel/Result";
import { NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import type { ILeadRepository } from "../ports/ILeadRepository";

export interface RequestLeadDemoCommand {
  leadId: string;
}

export interface RequestLeadDemoResult {
  id: string;
  demoRequestedAt: Date;
}

/**
 * Public prospect action: record that this Lead requested a demo.
 * Does not change workflow status. Idempotent on demoRequestedAt.
 */
export class RequestLeadDemoUseCase {
  constructor(private readonly leadRepository: ILeadRepository) {}

  async execute(
    command: RequestLeadDemoCommand,
  ): Promise<Result<RequestLeadDemoResult, Error>> {
    try {
      const leadId = command.leadId?.trim();
      if (!leadId) {
        return Result.fail(new ValidationError("leadId is required"));
      }

      const existing = await this.leadRepository.findById(leadId);
      if (!existing) {
        return Result.fail(new NotFoundError("Lead", leadId));
      }

      if (existing.demoRequestedAt) {
        return Result.ok({
          id: existing.id,
          demoRequestedAt: existing.demoRequestedAt,
        });
      }

      const at = new Date();
      const updated = await this.leadRepository.markDemoRequested(leadId, at);
      if (!updated) {
        return Result.fail(new NotFoundError("Lead", leadId));
      }

      return Result.ok({
        id: updated.id,
        demoRequestedAt: updated.demoRequestedAt!,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
