import { Result } from "../../shared/kernel/Result";
import { NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import type { Lead } from "../domain/Lead";
import type { ILeadRepository } from "../ports/ILeadRepository";

export class GetLeadUseCase {
  constructor(private readonly leadRepository: ILeadRepository) {}

  async execute(leadId: string): Promise<Result<Lead, Error>> {
    try {
      const id = leadId?.trim();
      if (!id) {
        return Result.fail(new ValidationError("leadId is required"));
      }
      const lead = await this.leadRepository.findById(id);
      if (!lead) {
        return Result.fail(new NotFoundError("Lead", id));
      }
      return Result.ok(lead);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
