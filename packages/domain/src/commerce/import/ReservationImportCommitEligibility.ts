import { ValidationError } from "../../shared/errors/DomainError";
import { Result } from "../../shared/kernel/Result";
import { findKeepCsvExclusivityViolations } from "./ReservationImportExclusivity";
import {
  canResumeReservationImportDraft,
  type ReservationImportBatchRecord,
  type ReservationImportRowRecord,
} from "./ReservationImportTypes";

export type CommitDurableSkipReason = "keep_existing" | "already_imported";

export type CommitRowPlan =
  | { kind: "import"; row: ReservationImportRowRecord }
  | {
      kind: "durable_skip";
      row: ReservationImportRowRecord;
      reason: CommitDurableSkipReason;
    };

export interface CommitEligibilitySuccess {
  plans: CommitRowPlan[];
  importCount: number;
  skipCount: number;
}

/**
 * Server-authoritative commit eligibility (UI readiness is not trusted).
 * Rejected rows are ignored and never block commit.
 */
export function evaluateReservationImportCommitEligibility(input: {
  batch: ReservationImportBatchRecord;
  rows: ReservationImportRowRecord[];
  now?: Date;
}): Result<CommitEligibilitySuccess, Error> {
  const now = input.now ?? new Date();
  const { batch, rows } = input;

  if (batch.status === "completed") {
    return Result.fail(new ValidationError("Import batch is already completed"));
  }
  if (batch.status !== "draft") {
    return Result.fail(
      new ValidationError(`Import batch is not commit-eligible (status: ${batch.status})`),
    );
  }
  if (!canResumeReservationImportDraft(batch, now)) {
    return Result.fail(new ValidationError("Import draft has expired"));
  }

  for (const row of rows) {
    if (row.status === "pending") {
      return Result.fail(
        new ValidationError(
          `Import commit blocked: row ${row.rowNumber} is still pending`,
        ),
      );
    }
    if (row.status === "failed") {
      return Result.fail(
        new ValidationError(
          `Import commit blocked: row ${row.rowNumber} failed preflight (${row.errorCode ?? "failed"})`,
        ),
      );
    }
    if (row.recheckRequired) {
      return Result.fail(
        new ValidationError(
          `Import commit blocked: row ${row.rowNumber} requires recheck`,
        ),
      );
    }
  }

  const exclusivity = findKeepCsvExclusivityViolations(rows);
  if (exclusivity.length > 0) {
    const first = exclusivity[0]!;
    return Result.fail(
      new ValidationError(
        `Import commit blocked: overlapping keep_csv rows ${first.aId} and ${first.bId}`,
      ),
    );
  }

  const plans: CommitRowPlan[] = [];
  for (const row of [...rows].sort((a, b) => a.rowNumber - b.rowNumber)) {
    const plan = classifyCommitRow(row);
    if (plan.isFailure) {
      return Result.fail(plan.getError());
    }
    plans.push(plan.getValue());
  }

  const importRefs = plans
    .filter((p) => p.kind === "import")
    .map((p) => p.row.externalReference.trim().toLowerCase());
  const seen = new Set<string>();
  for (const ref of importRefs) {
    if (seen.has(ref)) {
      return Result.fail(
        new ValidationError(
          `Import commit blocked: duplicate externalReference among import candidates (${ref})`,
        ),
      );
    }
    seen.add(ref);
  }

  return Result.ok({
    plans,
    importCount: plans.filter((p) => p.kind === "import").length,
    skipCount: plans.filter((p) => p.kind === "durable_skip").length,
  });
}

function classifyCommitRow(
  row: ReservationImportRowRecord,
): Result<CommitRowPlan, Error> {
  if (row.status === "skipped" || row.status === "skipped_already_imported") {
    if (
      row.errorCode === "ALREADY_IMPORTED" ||
      row.status === "skipped_already_imported"
    ) {
      return Result.ok({
        kind: "durable_skip",
        row,
        reason: "already_imported",
      });
    }
    if (
      row.conflictResolution === "keep_existing" ||
      row.errorCode === "KEEP_EXISTING"
    ) {
      return Result.ok({
        kind: "durable_skip",
        row,
        reason: "keep_existing",
      });
    }
    return Result.fail(
      new ValidationError(
        `Import commit blocked: row ${row.rowNumber} is skipped without a durable skip reason`,
      ),
    );
  }

  if (row.status === "ready") {
    const priceOk =
      row.priceSource === "imported_csv" ||
      row.priceSource === "talos_calculated" ||
      row.priceSource === "operator_entered";
    if (!priceOk) {
      return Result.fail(
        new ValidationError(
          `Import commit blocked: row ${row.rowNumber} has unresolved price`,
        ),
      );
    }
    if (row.conflictResolution === "keep_existing") {
      return Result.fail(
        new ValidationError(
          `Import commit blocked: row ${row.rowNumber} keep_existing must be skipped before commit`,
        ),
      );
    }
    if (
      (row.replaceBookingIds?.length ?? 0) > 0 &&
      row.conflictResolution !== "keep_csv"
    ) {
      return Result.fail(
        new ValidationError(
          `Import commit blocked: row ${row.rowNumber} has replaceBookingIds without keep_csv`,
        ),
      );
    }
    return Result.ok({ kind: "import", row });
  }

  if (
    row.status === "imported" ||
    row.status === "replaced" ||
    row.status === "discarded"
  ) {
    return Result.fail(
      new ValidationError(
        `Import commit blocked: row ${row.rowNumber} is already terminal (${row.status})`,
      ),
    );
  }

  return Result.fail(
    new ValidationError(
      `Import commit blocked: row ${row.rowNumber} has unsupported status ${row.status}`,
    ),
  );
}

export function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}
