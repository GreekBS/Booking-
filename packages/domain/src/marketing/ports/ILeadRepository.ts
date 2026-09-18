import type { Lead } from "../domain/Lead";

export interface ILeadRepository {
  create(lead: Lead): Promise<void>;
  findBySubmissionId(submissionId: string): Promise<Lead | null>;
}
