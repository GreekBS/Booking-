# CM-4b S3d atomic semantic transition

## Boundary

S3d implements the provider-neutral atomic semantic-mode transition transaction.
It does not implement activation approval (S3e), production HTTP wiring (S3f),
polling, iCal, credentials, Booking, or Inbox replay.

## Operation identity

```text
operation = channel.connection.set_semantic_mode
durable key = (tenantId, operation, commandId)
```

## Canonical fingerprint (`cm4b-s3d-fingerprint-v1`)

Fingerprint material uses a **length-prefixed UTF-8 envelope**, then SHA-256,
stored as lowercase 64-character hex in `request_fingerprint`.

Format version (hashed; identifies serialization, not the durable operation):

```text
cm4b-s3d-fingerprint-v1
```

Each field is encoded as:

```text
<nameUtf8ByteLen>:<name><valueUtf8ByteLen>:<value>
```

Lengths are **UTF-8 byte counts** (via `TextEncoder` / pure fallback), not
JavaScript string `.length`. Fields are concatenated in this fixed order:

1. `formatVersion`
2. `tenantId`
3. `operation`
4. `commandId`
5. `connectionId`
6. `actorId`
7. `expectedFromMode`
8. `expectedSemanticConfigVersion` (canonical base-10 integer string)
9. `targetSemanticMode`
10. `reasonDigest`

### Normalization

- String fields are hashed exactly as supplied after existing command validation
  (no extra trim; embedded newlines and colons are preserved).
- Enum modes use their canonical domain strings.
- `reasonDigest` is SHA-256 hex of the trimmed reason, or `""` when reason is
  absent, null, or blank. Absent and blank reasons are intentionally equivalent.
- Timestamps, committed results, secrets, payloads, URLs, HTTP, Booking, and
  Inbox data are excluded.

### Why this is unambiguous

Byte-length prefixes bind each name and value to an exact span. Embedded `\n`,
`\r`, `:`, or digit sequences cannot shift field boundaries the way naïve
newline-joined concatenation could. SHA-256 cannot repair ambiguous material;
the envelope prevents ambiguous material from being produced.

### Compatibility

Production semantic-management DI remains unwired (S3f). No public production
path executes S3d. This corrective pass is a **pre-release fingerprint format
change**; no durable production receipts can exist under the old ambiguous
format. No schema migration and no dual-format runtime fallback are required.
Disposable test/dev receipts are cleared by normal test setup.

## Atomic transaction flow

1. setTenantContext
2. claim receipt (`INSERT pending … ON CONFLICT DO NOTHING`) or lock existing
3. lock ChannelConnection (`FOR UPDATE`)
4. revalidate mode, expected version, Option B allow-list
5. on change: semantic CAS (`version → version + 1`)
6. on change: connection-first cursor delete
7. on change: audit insert
8. mark receipt committed with reconstructable result fields

Same-mode no-op: committed receipt with `changed=false`, no audit, no cursor reset,
no version bump. Stale `expectedSemanticConfigVersion` still conflicts before the
same-mode branch.

## Lock order

```text
command receipt → ChannelConnection → ChannelPollCursor
```

Cursor is never locked before connection.

## Idempotency

| Existing receipt | Matching fingerprint | Behavior |
|---|---|---|
| none | n/a | insert pending and execute |
| committed | yes | replay stored result; no writes |
| any | no | IdempotencyConflictError; no mutation |
| pending (other TX) | matching | ConflictError — retry after commit |
| pending (in-TX only) | — | not durable after rollback |

Failed transactions leave no pending receipt.

## Committed result reconstruction

Modes come from receipt request columns (`expected_from_mode`, `target_mode`).
Versions/flags come from committed result columns. Replay does not recompute from
current connection state.

## S2 path replacement

`SetChannelConnectionSemanticModeUseCase` delegates persistence exclusively to
`IChannelSemanticModeTransitionStore`. The sequential clearCursor → persist →
audit path is removed. Production DI remains unwired (S3f).

## Deferred

- S3e activation approval / activate-resume orchestration
- S3f production semantic-management exposure
