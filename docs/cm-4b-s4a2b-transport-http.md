# CM-4b S4a-2b — Webhook & Admin Transport HTTP

## Scope

S4a-2b exposes HTTP for the transport composition wired in S4a-2a:

- Public webhook ingress (raw-body safe)
- Admin manual poll enqueue
- Admin inbox replay

It does **not** implement providers, automatic polling schedules, transport-status,
opaque webhook tokens, Booking/Commerce coupling, or reservation emission.

Production `ChannelProviderRegistry` remains **empty by default**. Routes are
fail-closed until providers are allow-listed via `CHANNELS_ENABLED_PROVIDERS`.
P1-S1 adds an iCal factory constructor only; factory presence ≠ registration.

Fingerprint remains `cm4b-s3d-fingerprint-v1`. `mayEmitReservationCreate === false`.
**No migration.**

## Runtime

All new routes use `export const runtime = "nodejs"` so Prisma, credential vault
crypto, and existing transport use cases remain available (not Edge).

## Public webhook

```text
POST /api/channels/v1/webhooks/:provider/:tenantId/:connectionId
```

- Feature flag: `CHANNELS_WEBHOOK_API_ENABLED === "true"` (default off → **404**,
  no body read, no UC, no DB)
- **No session auth** — authenticity is provider verification inside
  `HandleChannelWebhookTransportUseCase`
- Raw body: streamed once into `Uint8Array`; no `request.json()` / `request.text()`
- Max body: **1 MiB** (`CHANNEL_WEBHOOK_MAX_BODY_BYTES`); declared `Content-Length`
  and actual bytes both enforced → **413**
- ACK only when `ackAllowed === true` → **200**
- NACK mapping uses domain `failureKind` (401/400/404/409/503/500) with generic bodies
- Tenant ID comes only from the route segment (enumeration soft spot; opaque webhook
  endpoint token deferred)

### Header forwarding (provider verification)

`collectWebhookHeaders` copies request headers into the transport verification contract:

- **Preserved:** `Authorization`, provider signature headers, timestamp / nonce /
  digest / content-type, and other provider-neutral verification headers
- **Excluded:** `Cookie` only (browser/session material is not part of provider
  verification)
- Authentication / signature header **values are never logged**, never returned in
  error bodies, never stored on inbox rows, jobs, or audit payloads by this HTTP
  adapter

The adapter stays provider-neutral: no provider-specific header allow-list.

### Rate limiting

Process-local, **memory-bounded** best-effort guard only:

- Hard cap: `CHANNEL_TRANSPORT_RATE_LIMIT_MAX_BUCKETS` (**4096**)
- Window: `CHANNEL_TRANSPORT_RATE_LIMIT_WINDOW_MS` (60s)
- Expired buckets are swept opportunistically (no per-key timers; no background
  interval that survives hot reload)
- When at capacity: sweep expired, then evict least-recently-used buckets
- Public webhook keys: coarse `wh:global` + `wh:ip:{hint}` only — **not**
  attacker-controlled `provider` / `tenantId` / `connectionId` route segments
- IP hint uses the same `x-forwarded-for` / `x-real-ip` convention as elsewhere;
  forwarded headers are **spoofable** unless overwritten at a trusted proxy and
  are **not** reliable security identities
- Rejected requests return **429** and do **not** invoke the transport use case

**Deployment-level WAF / edge / distributed rate limiting remains mandatory** in
production. The local limiter must not be treated as distributed protection.
High-cardinality public input cannot grow the local map without bound.

## Manual poll

```text
POST /api/admin/v1/channel-connections/:connectionId/poll
```

Requires:

```text
CHANNELS_OPERATOR_API_ENABLED=true
CHANNELS_POLLING_ENABLED=true
```

- Gate order (matches S4a-1 operator routes): session/tenant auth → feature flags
  (`CHANNELS_OPERATOR_API_ENABLED`, then `CHANNELS_POLLING_ENABLED`) → rate limit →
  application permission inside `EnqueueChannelConnectionPollUseCase`
- Unauthenticated callers do not learn feature state (401 before flag 404)
- Disabled flags return **404**; cross-tenant resources remain hidden via UC
- Enqueues `poll_channel_connection` with payload `{ connectionId }` only
- Idempotency key: `poll_channel_connection:{tenantId}:{connectionId}`
- Never runs provider poll synchronously
- Does not resolve credentials or load cursors in HTTP
- Eligibility: connection **active** + provider registered with polling capability
- Success: **202** `{ status: "queued", jobId, jobStatus }`

## Replay

```text
POST /api/admin/v1/channel-connections/:connectionId/inbox/:inboxItemId/replay
```

Requires:

```text
CHANNELS_OPERATOR_API_ENABLED=true
CHANNELS_INBOX_REPLAY_API_ENABLED=true
```

- Same auth → flags → permission-in-UC pattern as manual poll
- Reuses `ReplayChannelInboxItemUseCase` via ownership-scoped wrapper
- Verifies connection + inbox item belong to authenticated tenant and match each other
- Creates approved new inbox row / process attempt; does not mutate original evidence

## Explicit non-goals (unchanged)

- No operational provider sync in S4a-2b; live registry empty unless allow-listed
  (P1-S1: iCal factory exists; polling skeleton fail-closed)
- Flags remain off by default
- No migration / schema change
- No automatic poll schedule
- No transport-status endpoint
- No Booking / Commerce coupling; no reservation emission
  (`mayEmitReservationCreate` remains false)
- Fingerprint remains `cm4b-s3d-fingerprint-v1`
- S4a-1 and S4a-2a foundations unchanged by this HTTP slice

## Deferred

- Transport-status endpoint
- Opaque webhook endpoint token
- Automatic poll cadence / global sweep
- Real providers (Provider-1)
- DLQ UI

## Rollout / rollback

1. Deploy with all transport flags **off**
2. Enable in staging after Provider-1 (or a separately approved staging provider)
3. Rollback: set flags to not `"true"` — durable inbox/jobs remain intact
