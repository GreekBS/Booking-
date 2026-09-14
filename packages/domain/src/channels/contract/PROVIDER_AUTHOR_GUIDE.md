# Provider Author Guide — Channel Provider Certification

This guide describes how to certify a new channel provider adapter before it is accepted into the Channel Manager.

**Authority:** ADR-022, `ARCHITECTURE.md`, approved CM-4a-5 harness (with CM-4b S0a polling-only remediation).

## `reservation.unknown` taxonomy (CM-4b S1 + S0b)

New `reservation.unknown` messages should be built with `buildReservationUnknownMessage`, which requires a validated `unknownClassification` envelope (taxonomy v1).

- Closed categories and versioning policy: see `ARCHITECTURE.md` (CM-4b S1)
- Provider-specific detail → `providerDetail` (non-secret); do not invent domain categories
- Historical Inbox rows without an envelope remain valid; readers use legacy `other_unclassified` / `legacy_missing_taxonomy`
- Taxonomy does **not** enable Booking create/modify/cancel and does **not** imply iCal classification (later slices)

**S0b harness:** Contract suites assert taxonomy via `readUnknownClassification` / `validateUnknownClassificationV1`. Reference fixtures emit factory-built unknowns. Legacy fixtures without an envelope may still be interpreted (not required for new providers). New provider fixtures that emit `reservation.unknown` **must** include a real taxonomy envelope.

## Feed semantic modes (CM-4b S2)

Semantic mode is operator-declared trust about feed meaning on `ChannelConnection`. It is **provider-neutral** and does **not** authorize Booking creation, inventory mutation, Inbox bypass, or ACK/cursor commit changes.

**Closed modes:** `mixed_or_unknown_feed` (default), `availability_block_feed`, `reservation_feed`.

**Registration:** optionally declare `allowedFeedSemanticModes` on `ChannelProviderRegistration`. If omitted or empty, the platform fail-closes to `[mixed_or_unknown_feed]` only. Do not assume all three modes are available.

**Emission policy:** `mayEmitReservationCreate` is always `false` in base CM-4b. Declaring `reservation_feed` is never sufficient for `reservation.create` (CM-4b-R deferred).

**Evidence stamp:** when classifying, stamp `semanticContext: { mode, configVersion }` observed at classification time. Do not overload taxonomy `notes` / `providerDetail`. Do not reinterpret historical Inbox rows after a mode change.

**Poll workers:** load `semanticMode` + `semanticConfigVersion` per execution; if the connection version advances before commit, fail/retry rather than mixing semantic epochs.

Persistence of semantic fields is **S3** (not part of provider certification).

## Ingress boundary (mandatory)

Every reservation-related provider event must enter the platform only through:

```text
Provider adapter
  → Webhook transport and/or Poll transport
  → ReceiveChannelWebhookBatchUseCase / ReceiveChannelPollBatchUseCase
  → ReceiveChannelEventUseCase
  → Inbox
```

Providers must never:

- create `Booking` rows
- call Commerce use cases
- call `ReservationOrchestrator`
- call CM-3a (`ImportChannelReservationCreateDryRunUseCase`)
- call CM-3b-3 (`ImportChannelReservationCommandUseCase`)
- bypass `ReceiveChannelEventUseCase`

## Capability-driven contract selection

| Capability | Contract entry point | Fixture type |
|------------|---------------------|--------------|
| Webhook only | `defineWebhookProviderContract(fixture)` | `WebhookProviderContractFixture` |
| Polling only | `definePollingProviderContract(fixture)` | `PollingProviderContractFixture` |
| Webhook + polling | `defineCombinedProviderContract(fixture)` | `CombinedProviderContractFixture` |

Polling-only fixtures **must not** supply webhook builders, webhook providers, or webhook-only expected messages. Shared expectations live on `fixture.expectations` (normalized reservation messages and optional declared source events).

## Shared expectations

```typescript
expectations: {
  expectedReservationMessages: { create, modify, cancel, unknown },
  expectedSourceEvents?: ExpectedSourceEvent[], // silent-drop conformance
}
```

## Declared source events (silent-drop)

When `expectedSourceEvents` lists `reservationRelated: true` entries, the provider must emit corresponding normalized messages that reach Inbox. Omission is a **conformance failure**.

If the fixture declares **no** reservation-related source events and the provider returns an empty batch, the contract may pass.

**Limitation:** Undeclared external events cannot be detected by the platform. The harness only enforces sources the fixture declares.

## Destructive cursor incompatibility

Providers that consume or invalidate a cursor merely because `poll()` was called are **non-conformant**. The platform may invoke `poll()` at-least-once from the same committed cursor. Declaring `eligibility.destructiveCursor: true` fails the polling contract.

## Certification vs PostgreSQL / Booking authority

Passing the provider contract harness proves **ingress** behavior through approved poll/webhook orchestration into Inbox. It does **not** prove PostgreSQL EXCLUDE safety, Booking idempotency, or inventory authority. Those remain covered by Commerce/CM-3c integration tests when Booking-producing import is enabled.

## Certification steps (polling-only example)

```typescript
import { definePollingProviderContract } from "./harness/defineCombinedProviderContract";
import { createMyPollingOnlyFixture } from "./fixtures/myPollingOnlyFixture";

definePollingProviderContract(createMyPollingOnlyFixture());
```

## Production vs test code

| Location | Purpose |
|----------|---------|
| `src/channels/contract/` | Production-safe types and eligibility helpers |
| `tests/channels/contract/harness/` | Vitest contract suites (test-only) |
| `tests/channels/contract/fixtures/` | Provider fixtures (test-only) |

Production DI must not import harness code.
