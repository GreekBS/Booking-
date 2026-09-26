# ADR-030: QR Cleaning V1

**Status:** Accepted
**Date:** 2026-09-26
**Supersedes:** none
**Related:** ADR-029 (Housekeeping Tasks)

## Context

Housekeepers work from a phone, inside the unit, often with one hand free. The
Housekeeping board (ADR-029) already models the work — `Task` for the job and
`UnitHousekeepingStatus` for CLEAN/DIRTY readiness — but there was no way to
*perform* a cleaning: no per-unit entry point, no checklist, and no evidence.

We need a flow that starts with scanning a sticker inside the unit and ends with
the unit provably CLEAN, without inventing a second source of truth for
housekeeping state and without touching iCal, the worker, or calendar markers.

## Decision

### 1. Unit QR codes are opaque bearer identifiers, not credentials

`unit_qr_access` holds one ACTIVE row per unit (partial unique index on
`(tenant_id, unit_id) WHERE status = 'ACTIVE'`). The token is 32 random bytes
rendered as 64 hex characters; only its SHA-256 hash is stored, reusing the
`hashToken` helper that backs invitations.

**A scanned token grants nothing on its own.** `/q/<token>` requires an
authenticated session; `POST /api/admin/v1/qr/resolve` then resolves the hash
*within the caller's active tenant* and applies the property ACL. A token from
another tenant resolves to Not Found.

The consequence of hash-only storage is that an issued code can never be
re-displayed. Generate returns the plaintext exactly once; viewing an existing
code shows metadata plus a Rotate action. Rotation revokes the old row and mints
a new one in a single transaction, so the previous sticker stops working
immediately.

### 2. Task selection policy

A scan must land on the *right* housekeeping task rather than creating a new one
each time. In order:

1. an `IN_PROGRESS` HOUSEKEEPING task on the unit — resume it
2. an `OPEN` `TURNOVER` HOUSEKEEPING task — the departure-driven job
3. the oldest remaining `OPEN` HOUSEKEEPING task
4. no task, but the unit is `DIRTY` — open a `MANUAL` HOUSEKEEPING task
5. no task and the unit is `CLEAN` — there is nothing to clean

Step 4 is deliberately gated on DIRTY: a scan of a clean unit with no open work
is a no-op, not a way to manufacture tasks. The policy is a pure function
(`selectCleaningTask`) and is re-evaluated inside the start transaction under a
row lock on the unit, so concurrent scans converge on one execution.

### 3. Checklists are versioned templates, executions are immutable snapshots

`cleaning_checklist_templates` holds one ACTIVE template per property. Editing
bumps `version` and deactivates removed items rather than deleting them.

At start, active template items are copied into `cleaning_execution_items` as
label snapshots. A checklist edited mid-shift therefore cannot rewrite what a
housekeeper already agreed to, and history stays readable years later.

### 4. Completion is one transaction, or nothing

`CompleteCleaning` enforces three gates: every `required` item checked, every
`photo_required` item carrying at least one photo, and at least
`minimum_completion_photos` photos on the execution. The gate is a pure function
(`evaluateCleaningCompletion`) evaluated twice — once in the use case for a fast,
specific error message, and again **inside the completion transaction** under a
`FOR UPDATE` lock on the execution row, which is the authority.

Completion then marks the execution COMPLETED and calls the existing
`PrismaHousekeepingTurnoverStore.completeHousekeepingTask`, which closes the
Task and flips `UnitHousekeepingStatus` to CLEAN. Because `withTenantTransaction`
reuses the active transaction through AsyncLocalStorage, the nested call joins
the same transaction: the execution, the task and the unit readiness commit
together or not at all. There is no second housekeeping state machine.

### 5. Photos live in private object storage; the database keeps keys

`ICleaningObjectStorage` has two implementations:

- `SupabaseCleaningObjectStorage` — the production path. Uploads use the service
  role key (server only); reads are always short-lived `createSignedUrl` results,
  so the bucket (`CLEANING_PHOTOS_BUCKET`, default `cleaning-photos`) stays
  private. There are no public URLs anywhere in the flow.
- `LocalFsCleaningObjectStorage` — selected by `CLEANING_PHOTOS_DRIVER=fs`, used
  for local demos and real-database verification runs.

When neither is configured, `UnconfiguredCleaningObjectStorage` fails loudly on
every operation rather than silently dropping evidence.

Limits: 12 photos per execution, 10MB each, `image/jpeg | image/png | image/webp`.
The cap is enforced under a row lock so concurrent uploads cannot exceed it, and
a rejected row deletes the object it just uploaded so no orphans accumulate.

Storage keys are derived server-side from
`tenantId/propertyId/unitId/executionId/photoId.ext` — never from user input —
and the filesystem driver additionally refuses keys that escape its root.

### 6. Access control reuses the Housekeeping ACL verbatim

No new permissions were introduced. Reads resolve through `resolveTaskListScope`;
performing a cleaning requires both `task:update` and `housekeeping:update` on
the property; issuing QR codes and authoring checklists require `task:update`.
In practice: tenant admins act anywhere, managers only on assigned properties.

### 7. `callbackUrl` survives the login bounce

A scan by a signed-out housekeeper previously dropped them on `/dashboard`.
Middleware now redirects to `/login?callbackUrl=/q/<token>`, the sign-in form
honors it, and an already-authenticated visit to `/login?callbackUrl=…` forwards
straight through. `isSafeCallbackUrl` accepts only path-absolute same-origin
values — absolute URLs, protocol-relative `//host`, backslash tricks and
`/login` itself are all rejected, so this is not an open redirect.

## Consequences

**Good.** Housekeeping readiness keeps exactly one owner. A cleaning either
completes fully or leaves no trace. Evidence is private by default. Checklist
edits cannot rewrite history. Scanning is safe even if a sticker is photographed
and shared, because the token is not a credential.

**Accepted costs.** A QR code cannot be reprinted without rotating it — the
honest price of hash-only storage, and the UI says so plainly. A token only
resolves inside the scanner's *active* tenant, so a user who belongs to several
workspaces must switch first. Signed URLs mean photo links expire, which is
correct but requires the client to re-fetch rather than cache URLs.

**Explicitly out of scope.** iCal, worker activation and calendar housekeeping
markers are untouched. Cleaning never creates inventory blocks.

## Alternatives considered

- **Storing the token in plaintext so codes can be reprinted.** Rejected: it
  turns a database read into a physical-access grant for every unit.
- **Resolving tokens across tenants.** Rejected: it leaks unit existence across
  tenant boundaries for the cost of one guessed hash.
- **A separate `cleaning_status` column on Unit.** Rejected: two sources of truth
  for readiness is exactly the bug ADR-029 was written to avoid.
- **Completing the execution and the task in separate transactions.** Rejected:
  a crash between them leaves a unit that was cleaned but reads DIRTY, or a
  closed task with no evidence.
