import { isCompleteChannelMappingTarget } from "./channelInventoryApplyGate";

/**
 * Shared enable / pilotEligible classification (P1-S7c).
 * Health and EnableChannelConnectionInventoryApplyUseCase MUST use the same rule.
 */
export type InventoryApplyEnableEligibilityReason =
  | "global_inventory_apply_disabled"
  | "connection_not_active"
  | "provider_not_ical"
  | "semantic_mode_invalid"
  | "credential_missing"
  | "active_mapping_count_invalid"
  | "mapping_incomplete"
  | "rotation_in_progress"
  | "poll_job_dead_letter"
  | "reconcile_job_dead_letter"
  | "reconcile_job_cancelled_with_pending_generation"
  | "pending_reconciliation_without_runnable_job";

export interface InventoryApplyEnableEligibilityInput {
  readonly globalApplyEnabled: boolean;
  /** Connection-level inventory_apply_enabled bit. */
  readonly inventoryApplyForConnection: boolean;
  readonly status: string;
  readonly provider: string;
  readonly semanticMode: string;
  readonly hasCredentialRef: boolean;
  readonly activeMappings: ReadonlyArray<{ propertyId: string; unitId: string }>;
  readonly rotationInProgress: boolean;
  readonly latestPollJobStatus: string | null;
  readonly latestReconcileJobStatus: string | null;
  readonly pendingReconciliationCount: number;
}

function isRunnableReconcileJobStatus(status: string | null): boolean {
  return status === "pending" || status === "processing";
}

/**
 * Collect enable-blocking / pilotEligible reasons (deterministic, durable-state only).
 *
 * Architecture refinement (locked):
 * While connection apply is OFF, `pending_reconciliation_without_runnable_job` alone
 * is NOT a blocker — Sweep intentionally skips enqueue under the fence.
 * Dead-letter and cancelled+pending remain hard blockers in all apply states.
 */
export function collectInventoryApplyEnableEligibilityReasons(
  input: InventoryApplyEnableEligibilityInput,
): InventoryApplyEnableEligibilityReason[] {
  const reasons: InventoryApplyEnableEligibilityReason[] = [];

  if (!input.globalApplyEnabled) {
    reasons.push("global_inventory_apply_disabled");
  }
  if (input.status !== "active") {
    reasons.push("connection_not_active");
  }
  if (input.provider !== "ical") {
    reasons.push("provider_not_ical");
  }
  if (input.semanticMode !== "availability_block_feed") {
    reasons.push("semantic_mode_invalid");
  }
  if (!input.hasCredentialRef) {
    reasons.push("credential_missing");
  }

  if (input.activeMappings.length !== 1) {
    reasons.push("active_mapping_count_invalid");
  } else if (!isCompleteChannelMappingTarget(input.activeMappings[0]!)) {
    reasons.push("mapping_incomplete");
  }

  if (input.rotationInProgress) {
    reasons.push("rotation_in_progress");
  }

  if (input.latestPollJobStatus === "dead_letter") {
    reasons.push("poll_job_dead_letter");
  }

  if (input.latestReconcileJobStatus === "dead_letter") {
    reasons.push("reconcile_job_dead_letter");
  }

  if (
    input.pendingReconciliationCount > 0 &&
    input.latestReconcileJobStatus === "cancelled"
  ) {
    reasons.push("reconcile_job_cancelled_with_pending_generation");
  }

  // Intentional fence freeze: while apply OFF, Sweep does not enqueue.
  // pending + no runnable job (null / completed / deferred path) is ALLOW.
  // When apply ON, the same durable state means stuck recovery is required.
  if (
    input.inventoryApplyForConnection &&
    input.pendingReconciliationCount > 0 &&
    !isRunnableReconcileJobStatus(input.latestReconcileJobStatus) &&
    input.latestReconcileJobStatus !== "dead_letter" &&
    input.latestReconcileJobStatus !== "cancelled"
  ) {
    reasons.push("pending_reconciliation_without_runnable_job");
  }

  return reasons;
}

/**
 * Attention signal for pending without runnable work.
 * Suppressed while connection apply is OFF (intentional Sweep skip).
 * Dead-letter / cancelled use their own attention codes.
 */
export function shouldAttentionPendingWithoutRunnableJob(input: {
  inventoryApplyForConnection: boolean;
  pendingReconciliationCount: number;
  latestReconcileJobStatus: string | null;
}): boolean {
  if (!input.inventoryApplyForConnection) return false;
  if (input.pendingReconciliationCount <= 0) return false;
  if (isRunnableReconcileJobStatus(input.latestReconcileJobStatus)) return false;
  // Prefer specific codes when they apply; still flag generic stuck when apply ON.
  return true;
}
