import type { Lead } from "../domain/Lead";
import type { LeadStatus } from "../domain/LeadTypes";

export interface ListLeadsQuery {
  page: number;
  limit: number;
  /** When true, prefer NEW + demo-requested + recent ordering. */
  prioritizeOperational?: boolean;
}

export interface ListLeadsResult {
  data: Lead[];
  total: number;
  page: number;
  limit: number;
}

export interface ILeadRepository {
  create(lead: Lead): Promise<void>;
  findBySubmissionId(submissionId: string): Promise<Lead | null>;
  findById(id: string): Promise<Lead | null>;
  list(query: ListLeadsQuery): Promise<ListLeadsResult>;
  /** Persist demoRequestedAt only when currently null (idempotent). */
  markDemoRequested(id: string, at: Date): Promise<Lead | null>;
  /** Persist internal workflow status only. */
  updateStatus(id: string, status: LeadStatus): Promise<Lead | null>;
}
