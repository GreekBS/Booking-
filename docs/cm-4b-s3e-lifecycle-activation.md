# CM-4b S3e — Lifecycle Activate / Resume under Semantic Policy & Epoch CAS

## Boundaries

| Slice | Responsibility |
| --- | --- |
| **S3d** | Atomic semantic-mode mutation (receipt, fingerprint, semantic CAS +1, cursor reset, semantic audit) |
| **S3e** | Lifecycle activate/resume under mandatory semantic policy and semantic-epoch CAS |
| **S3f** | Production exposure and wiring of semantic-mode management (see `docs/cm-4b-s3f-production-semantic-management.md`) |

S3e does **not** call the S3d transition store, reset or mutate cursors, infer semantic mode from feeds, enable polling, emit reservations, create Bookings, wire semantic-mode management, add lifecycle receipts, add semantic activation state, or create migrations.

Semantic mode changes while `active` remain allowed (S3d).

## Lifecycle source statuses

### Activate

Allowed loaded source status: `pending_auth` | `error`

Flow: capture `priorStatus` → `connection.activate(now)` → `activateWithExpectedSemanticVersion(...)`

Reject: `draft`, `paused`, `active`, `disconnected`, and every other unsupported state → `ConflictError`

### Resume

Allowed loaded source status: `paused`

Flow: capture `priorStatus` → `connection.resume(now)` → `resumeWithExpectedSemanticVersion(...)`

Reject: `error`, `pending_auth`, `draft`, `active`, `disconnected`, … → `ConflictError`

`error → active` is **activate**, not resume.

## Authorization and policy order

1. Validate command shape (`tenantId`, `connectionId`, mandatory `expectedSemanticConfigVersion`, optional `correlationId`)
2. Authorize `channels:connection:manage:tenant` → else `ForbiddenError`
3. Load `findById(tenantId, connectionId)`
4. Missing / cross-tenant invisible → `NotFoundError`
5. Inspect persisted `semanticMode`
6. If `reservation_feed` → require `channels:connection:declare_reservation_feed:tenant` → else `ForbiddenError`
7. Resolve provider registration and `allowedFeedSemanticModes`
8. Missing registration / unresolvable policy → fail closed (`ChannelProviderRegistrationError` / `ValidationError`)
9. `connection.assertSemanticActivationAllowed({ allowedFeedSemanticModes, actorMayDeclareReservationFeed })`
10. Capture and validate prior lifecycle status
11. `connection.activate(now)` or `connection.resume(now)`
12. One application-owned transaction: lifecycle CAS + lifecycle audit

Permission checks live in the application layer. The aggregate may receive resolved permission facts but must not call authorization infrastructure.

## Command and result

```ts
{
  tenantId: string;
  connectionId: string;
  expectedSemanticConfigVersion: number; // mandatory for every caller
  correlationId?: string | null;
  now?: Date;
}

→ {
  connectionId: string;
  status: "active";
  semanticMode: FeedSemanticMode;
  semanticConfigVersion: number;
}
```

Callers never supply lifecycle status.

## Transaction model

The use case owns exactly one interactive transaction for the successful persistence stage:

```text
setTenantContext → lifecycle CAS → lifecycle audit insert → commit
```

- Repository participates when passed the transaction client; no nested transaction
- Audit uses the same transaction client
- Audit failure rolls back the lifecycle update
- Failed attempts create no durable lifecycle success audit

Permission checks, provider-policy resolution, load, and domain mutation may occur before the transaction. S3e does not reload inside the transaction solely for this slice.

## CAS predicates

### Activate

```text
tenantId + id + status = priorStatus (pending_auth|error)
+ semanticConfigVersion = expected
+ credential_ref IS NOT NULL
→ status=active, lastError=null, updatedAt=now
```

### Resume

```text
tenantId + id + status = paused
+ semanticConfigVersion = expected
+ credential_ref IS NOT NULL
→ status=active, lastError=null, updatedAt=now
```

Does **not** write: `semanticMode`, `semanticConfigVersion`, provider identity, cursor state, semantic evidence.

Zero-row classification (tenant-scoped): missing → `NotFoundError`; otherwise `ConflictError` with stable `conflictType` where practical (`semantic_epoch_conflict`, `lifecycle_status_conflict`, `credential_conflict`).

Optimistic CAS is **not** `FOR UPDATE` locking.

## Generic-save status omission

`saveNonSemanticChanges` physically omits lifecycle `status` (PostgreSQL + in-memory + port documentation). It continues to omit semantic columns and provider identity.

A caller mutating status in memory and then calling `saveNonSemanticChanges` leaves persisted status unchanged.

## Restricted lifecycle primitives

Because generic save no longer persists status:

- `pauseWithExpectedSemanticVersion`
- `markErrorWithExpectedSemanticVersion`
- `disconnectWithExpectedSemanticVersion`

These are persistence primitives (not public product flows). They CAS on tenant, connection id, loaded prior status, and semantic version; never write `status = active`; do not change semantic columns; are not exposed directly to HTTP handlers.

## Audit

| Action | When |
| --- | --- |
| `channel.connection.activated` | Successful activate |
| `channel.connection.resumed` | Successful resume |

Resource: `ChannelConnection`

Metadata: `previousStatus`, `newStatus: "active"`, `semanticMode`, `semanticConfigVersion`, optional `correlationId`

Never includes credentials, credential refs (when sensitive), cursor payload, raw feed payload, secrets, or semantic evidence payloads.

## Non-idempotent lifecycle behavior

Lost response after success: no lifecycle receipt; caller re-reads `active`; retry returns `ConflictError`. Intentional.

## Concurrency with S3d

- **S3d first** (`N → N+1`), S3e expects `N` → S3e CAS fails (`ConflictError`), no lifecycle audit
- **S3e first** (`status → active` at `N`), S3d may still transition at expected `N` → advances to `N+1` and resets cursor (allowed)

Duplicate activate/resume: one CAS winner, one `ConflictError`, exactly one lifecycle audit.

## S3f exclusions

S3e does not wire semantic-mode management HTTP. That belongs to S3f
(`SetChannelConnectionSemanticModeUseCase` + admin GET/PUT). S3e still must not
call the S3d store or auto-activate after semantic changes.

## Production use

When a production path needs activate/resume:

```text
HTTP/controller/job → ActivateChannelConnectionUseCase | ResumeChannelConnectionUseCase
```

Never call lifecycle repository helpers directly from HTTP. Implementing use cases without an HTTP route in S3e is acceptable.
