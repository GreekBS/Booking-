# CM-4b S4a-1 — Operator Foundation

## Scope

S4a-1 exposes production operator APIs for channel connections, sealed credentials,
and lifecycle commands (activate / pause / resume / disconnect).

It does **not** implement S4a-2 transport wiring (webhook HTTP, polling, provider
registry bootstrap, replay HTTP, transport status).

Semantic governance (S3d–S3f), fingerprint `cm4b-s3d-fingerprint-v1`, inbox-first
ingress, lifecycle CAS, and `mayEmitReservationCreate === false` are unchanged.

## Routes

```text
GET    /api/admin/v1/channel-connections
POST   /api/admin/v1/channel-connections
GET    /api/admin/v1/channel-connections/:connectionId
PATCH  /api/admin/v1/channel-connections/:connectionId
PUT    /api/admin/v1/channel-connections/:connectionId/credentials
PUT    /api/admin/v1/channel-connections/:connectionId/webhook-verification
POST   /api/admin/v1/channel-connections/:connectionId/activate
POST   /api/admin/v1/channel-connections/:connectionId/pause
POST   /api/admin/v1/channel-connections/:connectionId/resume
POST   /api/admin/v1/channel-connections/:connectionId/disconnect
```

Existing S3f semantic-mode routes remain under a separate feature flag.

Tenant comes only from authenticated tenant context. Strict Zod schemas reject
body `tenantId` and other unknown keys.

## Feature gate

```text
CHANNELS_OPERATOR_API_ENABLED
```

- Enabled only when exactly `"true"`
- Default: disabled
- Order: authenticate / resolve tenant → flag → use case
- Disabled → **404** (not 403)
- Disabled routes never invoke credential storage

## Credentials

- Port: `IChannelCredentialStore`
- Adapter: `PrismaChannelCredentialVault` (also implements `IChannelCredentialResolver`)
- AEAD helpers live in `@hcp/database` (`channelCredentialCrypto.ts`) so `@hcp/domain` stays free of `node:crypto`
- Sealed AEAD ciphertext in `channel_secret_records`
- Connection stores opaque refs only; HTTP/audit/read models expose booleans
  (`hasCredentialRef`, `hasWebhookVerificationRef`) — never secrets

### Required master key

```text
CHANNELS_CREDENTIALS_MASTER_KEY
```

| Rule | Detail |
|------|--------|
| Format | Base64 encoding of **exactly 32** cryptographically random bytes |
| Generation | e.g. `openssl rand -base64 32` |
| Environments | Distinct key per environment (dev / staging / production) |
| Secrets hygiene | Never commit the key; never log it; never put a real key in `.env.example` |
| Missing / invalid | Fail closed — no encrypt, no decrypt, no secret row, no credential ref attach |
| HTTP mapping | Server misconfiguration → `PERSISTENCE_CORRUPTION` (500), not client 400 |
| Loss of key | Existing ciphertext is **permanently unreadable** |
| Key change | Changing the key without a migration/rotation procedure makes existing secrets unreadable |
| `key_version` | Persisted column for future rotation metadata; **does not** auto-rotate keys today |

### Build / DI behavior

`PrismaChannelCredentialVault` is constructed eagerly for DI, but the master key is
parsed **lazily** on the first seal/unseal. This allows `next build` and route module
loading without the env var when the operator API stays disabled. There is **no**
placeholder or deterministic fallback key.

## Lifecycle

Reuses S3e CAS helpers for activate/resume; pause/disconnect use the same epoch
CAS pattern without lifecycle receipts. Semantic columns are not mutated.

## DI (wired)

- Create / List / Get / UpdateMetadata
- PutCredentials / PutWebhookVerification
- Activate / Resume / Pause / Disconnect
- `PrismaChannelCredentialVault`
- `PrismaChannelConnectionLifecycleUnitOfWork`

## DI (explicitly not wired in S4a-1)

Transport composition, registry bootstrap, and poll job registration landed in
**CM-4b S4a-2a** (see `docs/cm-4b-s4a2a-transport-di-wiring.md`). S4a-1 still
does not expose webhook/poll/replay HTTP.

## Migration

`20260723120000_cm4b_s4a1_channel_secrets` — `channel_secret_records` + RLS only.

## Tracked debt (non-blocking)

1. Secret insert and connection-reference attachment are not atomic; failures after
   insert may leave sealed orphan rows.
2. Concurrent credential rotation is last-write-wins and may create orphan rows.
3. Disconnect/rotation does not currently purge (soft-delete) old secret rows.
4. RLS testing does not yet prove enforcement through a non-owner PostgreSQL role.
5. Connection listing is currently unpaginated.
