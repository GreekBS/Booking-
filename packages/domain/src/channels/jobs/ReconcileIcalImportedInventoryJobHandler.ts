import type { BackgroundJobEntry } from "../../shared/types/index";
import type { IBackgroundJobHandler } from "../../platform/async/jobs/ports/IBackgroundJobHandler";
import { RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { ReconcileIcalImportedInventoryUseCase } from "../application/ReconcileIcalImportedInventoryUseCase";

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(
      `Invalid ${RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE} payload: ${key} is required`,
    );
  }
  return value.trim();
}

function requirePositiveInt(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(
      `Invalid ${RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE} payload: ${key} must be a positive integer`,
    );
  }
  return value;
}

export type ReconcileJobLogFn = (fields: Record<string, unknown>) => void;

export class ReconcileIcalImportedInventoryJobHandler implements IBackgroundJobHandler {
  constructor(
    private readonly useCase: ReconcileIcalImportedInventoryUseCase,
    private readonly log: ReconcileJobLogFn = () => {},
  ) {}

  canHandle(jobType: string): boolean {
    return jobType === RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    const tenantId = job.tenantId;
    if (!tenantId) {
      throw new Error(`${RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE} job is missing tenantId`);
    }

    const connectionId = requireString(job.payload, "connectionId");
    const cursorVersion = requirePositiveInt(job.payload, "cursorVersion");
    const semanticConfigVersion =
      typeof job.payload.semanticConfigVersion === "number"
        ? job.payload.semanticConfigVersion
        : undefined;
    const mappingId =
      typeof job.payload.mappingId === "string" ? job.payload.mappingId : undefined;
    const mappingVersion =
      typeof job.payload.mappingVersion === "number" ? job.payload.mappingVersion : undefined;

    const started = Date.now();
    const result = await this.useCase.execute({
      tenantId,
      connectionId,
      cursorVersion,
      observedSemanticConfigVersion: semanticConfigVersion,
      observedMappingId: mappingId,
      observedMappingVersion: mappingVersion,
    });

    if (result.isFailure) {
      throw result.getError();
    }

    const value = result.getValue();
    this.log({
      action: "channels.ical_inventory_reconcile",
      tenantId,
      connectionId,
      cursorVersion,
      jobId: job.id,
      reconciliationStatus: value.ok ? value.reconcileStatus : value.reconcileStatus,
      execution: value.execution,
      desiredItemCount: value.ok ? value.desiredItemCount : 0,
      createdCount: value.ok ? value.createdCount : 0,
      updatedCount: value.ok ? value.updatedCount : 0,
      retainedStaleCount: value.ok ? value.retainedStaleCount : 0,
      deactivatedCount: value.ok ? value.deactivatedCount : 0,
      deferReason: value.ok ? value.deferReason : undefined,
      failureCode: value.ok ? undefined : value.code,
      durationMs: Date.now() - started,
    });

    if (!value.ok && value.shouldRetryJob) {
      throw new Error(value.message || "ICAL_INVENTORY_RECONCILE_RETRY");
    }
  }
}
