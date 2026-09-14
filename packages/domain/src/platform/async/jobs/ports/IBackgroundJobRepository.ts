import type {
  BackgroundJobEntry,
  ClaimJobBatchFilter,
  EnqueueJobCommand,
  JobFailureDisposition,
} from "../../../../shared/types/index";

export interface IBackgroundJobRepository {
  enqueue(command: EnqueueJobCommand): Promise<BackgroundJobEntry>;
  findById(id: string): Promise<BackgroundJobEntry | null>;
  claimBatch(limit: number, filter?: ClaimJobBatchFilter): Promise<BackgroundJobEntry[]>;
  markCompleted(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<JobFailureDisposition>;
  cancel(id: string): Promise<void>;
}
