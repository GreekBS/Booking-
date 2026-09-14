# CM-4b S3f — Production Semantic-Mode Management Wiring & Operator Exposure

## Scope

S3f is **API-only**. It exposes production DI and admin HTTP for semantic-mode
management. It does **not** add UI, migrations, polling, Inbox replay, reservation
emission, Booking creation, or S3e activate/resume HTTP.

Closed S3d/S3e behavior is preserved unchanged.

## Routes

```text
GET  /api/admin/v1/channel-connections/:connectionId/semantic-mode
PUT  /api/admin/v1/channel-connections/:connectionId/semantic-mode
```

Tenant comes only from authenticated tenant context (`x-tenant-id` validated
against membership). Body `tenantId` is rejected by the strict PUT schema.

## Feature gate

Environment variable:

```text
CHANNELS_SEMANTIC_MODE_API_ENABLED
```

- Enabled **only** when the value is exactly `"true"`
- Default: **disabled**
- One flag gates both GET and PUT
- Evaluation order: authenticate / resolve tenant → evaluate flag → disabled → **404**
- Disabled does **not** return 403

## Mutation path (only)

```text
HTTP route
→ SetChannelConnectionSemanticModeUseCase
→ IChannelSemanticModeTransitionStore (PrismaChannelSemanticModeTransitionStore)
```

There is no alternate semantic mutation use case or service. Routes must not call
the transition store, cursor repository, semantic persist repository, or audit
repository directly.

## Read path

```text
HTTP GET
→ GetChannelConnectionSemanticConfigurationUseCase
→ tenant-scoped connection load + provider allow-list + actor capability
```

Read does not mutate, call the S3d store, or query receipts/cursors/audit history.

### GET response

| Field | Meaning |
| --- | --- |
| `semanticMode` | Persisted current mode (even if outside current provider allow-list) |
| `allowedSemanticModes` | Provider policy allow-list (deterministic order) |
| `canDeclareReservationFeed` | Actor has `channels:connection:declare_reservation_feed:tenant` |
| `connectionUpdatedAt` | Connection `updatedAt` (any connection update — **not** semantic transition time) |

`reservation_feed` may appear in `allowedSemanticModes` while
`canDeclareReservationFeed` is false. Those are different facts.

## PUT body

```ts
{
  targetMode: FeedSemanticMode;
  expectedSemanticConfigVersion: number; // mandatory positive integer
  commandId: string;                     // body-authoritative, mandatory
  confirmation: {
    confirmed: true;
    acknowledgedFromMode: FeedSemanticMode;
    acknowledgedToMode: FeedSemanticMode;
  };
  reason?: string; // trimmed; max 500; no silent truncation
}
```

### Command ID authority

- `body.commandId` is authoritative
- Do **not** prefer `Idempotency-Key`
- If `Idempotency-Key` is present, it **must equal** `body.commandId` or the
  request fails with **400** before the use case runs
- Header-only command IDs are rejected; the server never generates command IDs

**After an uncertain response, retry with the same `commandId` and identical
command content.**

## Authorization (closed S3d XOR)

| Operation | Permission |
| --- | --- |
| GET | `channels:connection:manage:tenant` |
| PUT target ≠ `reservation_feed` | `channels:connection:manage:tenant` |
| PUT target = `reservation_feed` | `channels:connection:declare_reservation_feed:tenant` |

Missing permission → `ForbiddenError` → HTTP **403**.

Cross-tenant / missing connection → HTTP **404** (no existence leak).

## Confirmation

Server-enforced for every PUT (including same-mode no-ops and exact replays):

- `confirmed === true`
- `acknowledgedToMode === targetMode`
- `acknowledgedFromMode` participates as the store `expectedFromMode` (fingerprinted)

For a **fresh** transition, `acknowledgedFromMode` must equal the live connection
mode (otherwise HTTP **400**). Exact replay of a prior successful command keeps the
original confirmation body; the S3d store short-circuits on the receipt before
re-checking live mode. Confirmation itself is **not** fingerprinted.

## Same-mode and replay (S3d)

- Same mode + current expected version → receipt committed, `changed=false`,
  no version bump, no cursor reset, no semantic audit; first execution
  `replayed=false`
- Exact replay → HTTP **200**, `changed=false` (or prior result), `replayed=true`
- Same mode + **stale** expected version → `ConflictError` → HTTP **409**
- Fingerprint conflict → `IdempotencyConflictError` → HTTP **409**
- Pending receipt → `ConflictError` → HTTP **409**; retry with same commandId
  and identical fingerprinted content

Fingerprint format remains **`cm4b-s3d-fingerprint-v1`**.

## Lifecycle

Semantic changes do **not** activate, resume, pause, disconnect, fetch feeds,
replay Inbox, emit reservations, or create Bookings. Active and inactive
lifecycle statuses remain unchanged by S3f.

Cursor reset remains inside the S3d store transaction when the mode changes.

## Audit / reason

Audit action: `channel.connection.semantic_mode_changed` (S3d).

Raw `reason` is audited. Operators must **not** include credentials, secrets,
personal data, or raw feed payloads. HTTP enforces max length 500.

## HTTP success

Always **200 OK** for first success, same-mode no-op, and exact replay.
Response fields come from the durable S3d result (no fabricated values).

## Explicit non-goals

- No migration
- No UI
- No S3e activate/resume HTTP
- No polling / Inbox replay / reservation emission / Booking creation
- No auto activate/resume after semantic change
