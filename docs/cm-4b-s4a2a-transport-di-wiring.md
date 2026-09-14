# CM-4b S4a-2a — DI, Registry Bootstrap & Poll-Job Wiring

## Scope

S4a-2a composes approved Channel Manager transport and polling components in
production DI and registers the poll background-job handler.

It does **not** implement S4a-2b HTTP surfaces (public webhook, manual poll,
replay, or transport-status routes).

It does **not** implement any channel provider (iCal, Booking.com, Airbnb,
Expedia, TestChannel, or placeholders).

It does **not** enable reservation emission or Booking/Commerce coupling.

Fingerprint remains `cm4b-s3d-fingerprint-v1`. `mayEmitReservationCreate === false`.
S4a-1 operator routes and sealed credential vault behavior are unchanged.
**No migration.**

## What S4a-2a makes ready

- Production `ChannelProviderRegistry` bootstrap (empty by default)
- Transport use-case composition (webhook + poll) for later HTTP wiring
- Same `PrismaChannelCredentialVault` instance as store **and** resolver
- `PrismaChannelPollCursorRepository` in production DI
- `PollChannelConnectionJobHandler` registered once behind a feature gate

S4a-2a does **not** make production polling operational against a real channel.
It only makes composition and gated job execution ready.

## Environment variables

```text
CHANNELS_ENABLED_PROVIDERS=
CHANNELS_POLLING_ENABLED=false
```

### `CHANNELS_ENABLED_PROVIDERS`

- Comma-separated provider IDs
- Trim each entry; drop empties
- Case-sensitive
- Duplicate IDs → fail closed (`ValidationError`)
- Unknown IDs → fail closed (`ValidationError`)
- Missing / empty / whitespace-only → healthy **empty** registry
- S4a-2a shipped **zero** production factories. **P1-S1** adds the iCal factory
  constructor only (`PRODUCTION_CHANNEL_PROVIDER_FACTORIES.ical`). Factory
  presence does **not** register iCal; an empty allow-list still yields an empty
  live registry. The polling skeleton is fail-closed until P1-S2.

### `CHANNELS_POLLING_ENABLED`

- Enabled only when exactly `"true"`
- Default: disabled
- When disabled, a queued `poll_channel_connection` job completes as a **safe no-op**:
  - does not retry indefinitely
  - does not dead-letter merely because polling is disabled
  - does not invoke provider lookup, credential resolve, cursor load/advance, or inbox writes

## Scheduling

- No automatic poll cadence / global sweep in S4a-2a
- No manual poll HTTP route (deferred to S4a-2b)
- Existing `/api/internal/v1/jobs/run` remains the job execution boundary

## DI (wired in S4a-2a)

- `ChannelProviderRegistry` (bootstrapped empty by default; P1-S1 may register
  iCal only when allow-listed)
- `ChannelIngressBatchProcessor` → `ReceiveChannelEventUseCase`
- `ReceiveChannelWebhookBatchUseCase`
- `ReceiveChannelPollBatchUseCase`
- `HandleChannelWebhookTransportUseCase` (exported for S4a-2b; no route yet)
- `ExecuteChannelPollConnectionUseCase`
- `PrismaChannelPollCursorRepository`
- `PrismaChannelCredentialVault` (reused as `IChannelCredentialResolver`)
- `PollChannelConnectionJobHandler` + `PollingFeatureGatedPollJobHandler`

## Explicitly deferred from S4a-2a (implemented in S4a-2b)

See `docs/cm-4b-s4a2b-transport-http.md` for:

- public webhook HTTP
- manual poll enqueue HTTP
- inbox replay HTTP

Still deferred past S4a-2b: transport-status, opaque webhook token, automatic schedule, real providers.

## Provider-1

Real provider factories, SSRF controls, endpoint allow-lists, and signature
algorithms belong to Provider-1. Do not claim production channel polling is live
until a provider is registered and flags are intentionally enabled.
