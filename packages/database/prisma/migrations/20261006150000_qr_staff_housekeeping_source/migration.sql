-- Allow QR_STAFF as unit/location housekeeping readiness source (ADR-030 staff PIN flow).

ALTER TABLE "unit_housekeeping_statuses"
  DROP CONSTRAINT IF EXISTS "unit_housekeeping_statuses_source_check";

ALTER TABLE "unit_housekeeping_statuses"
  ADD CONSTRAINT "unit_housekeeping_statuses_source_check"
  CHECK (
    "source" IN (
      'INIT',
      'TURNOVER',
      'TASK_COMPLETE',
      'TASK_REOPEN',
      'MANUAL',
      'SYSTEM',
      'QR_STAFF'
    )
  );

ALTER TABLE "cleaning_location_statuses"
  DROP CONSTRAINT IF EXISTS "cleaning_location_statuses_source_check";

ALTER TABLE "cleaning_location_statuses"
  ADD CONSTRAINT "cleaning_location_statuses_source_check"
  CHECK (
    "source" IN (
      'INIT',
      'TURNOVER',
      'TASK_COMPLETE',
      'TASK_REOPEN',
      'MANUAL',
      'SYSTEM',
      'QR_STAFF'
    )
  );
