# Channels Bounded Context

Channel manager integrations (Booking.com, Airbnb, Vrbo, Expedia, Google Vacation Rentals, iCal).

## Source of truth

- **Booking** is the single source of truth for reservation state.
- **UnitCalendarBlock** is the single source of truth for inventory.
- Channels **synchronizes** external providers with Commerce; it never owns reservation or availability state.

## Inventory consistency & double-booking guarantees

See `docs/adr/022-inventory-consistency-double-booking-guarantees.md` — **ADR-022: Inventory Consistency & Double Booking Guarantees**.

This is the permanent constitutional document for the Channels bounded context and all future channel integrations. It governs:

- **Inventory ownership** — Commerce owns inventory; Channels synchronizes into Commerce
- **Booking creation** — every channel booking must follow the approved ingress → validation → atomic commit pipeline
- **Ingress pipeline** — `ReceiveChannelEventUseCase` is the only public entry; ACK after Inbox persist; async processing via Background Jobs
- **Idempotency** — Inbox deduplication, job idempotency, `ExternalReservationLink` uniqueness, and lease ownership
- **PostgreSQL EXCLUDE authority** — advisory orchestrator checks; EXCLUDE is the final inventory lock
- **Zero double-booking tolerance** — complementary layers; concurrent commit guarantee; forbidden shortcuts; future review checklist
- **Idempotent booking mutations** — see ADR-022 § "Idempotent booking mutations (at-least-once)"; every channel mutation (CREATE, MODIFY, CANCEL, REPLAY, and future operations) must be safe under repeated execution

No channel feature may bypass this ADR. Exceptions require an explicit superseding ADR.

## CM-3c scope (channel ingress)

Production channel ingress for `reservation.create` events:

- `ChannelInboxItem` — append-only provider evidence with processing metadata
- `ReceiveChannelEventUseCase` — **only public ingress**; returns success when inbox + job are durable (adapter ACK stays outside application layer)
- `ProcessChannelInboxItemUseCase` — async processor: CM-3a → CM-3b-3
- `ReplayChannelInboxItemUseCase` — resubmits via `ReceiveChannelEventUseCase` (new inbox row)
- `process_channel_inbox` background job via existing job infrastructure

Pipeline:

```
Adapter → ReceiveChannelEventUseCase → Inbox → Background Job
  → ProcessChannelInboxItemUseCase → CM-3a → CM-3b-3 → Commerce → EXCLUDE → Link
```

Not in CM-3c: webhook/polling HTTP routes, OTA adapters, MODIFY/CANCEL handlers.

See ADR-022 and `docs/adr/022-inventory-consistency-double-booking-guarantees.md`.

## CM-4a scope (provider adapter foundation)

Provider transports connect external systems to the CM-3c ingress pipeline. Authoritative policy: **ADR-022** (`docs/adr/022-inventory-consistency-double-booking-guarantees.md`), especially §4.1 and §4.2.

Permanent rules:

- **Transport isolation (allow-list)** — Transport/orchestrator/provider code may depend **only** on: `ReceiveChannelEventUseCase`, `ChannelProviderRegistry`, `IChannelCredentialResolver`, `IChannelPollCursorRepository`, `IChannelConnectionRepository` (read-only), shared channel types/DTOs, provider contracts, and shared kernel errors. Everything else from the application layer is forbidden by default. Enforced by `transportDependencyPolicy.ts` and `ChannelArchitectureFitness.test.ts` (full enforcement from CM-4a-2).
- **Single ingress** — `ReceiveChannelEventUseCase` is the only allowed reservation ingress for channel-originated events.
- **Reconciliation and support tooling** — Reconciliation jobs, migration utilities, support scripts, CLI tools, and internal services must not create bookings, calendar blocks, or `ExternalReservationLink` rows directly. Missing reservations must be submitted through Receive → Inbox → Background Jobs → CM-3a → CM-3b-3 → Commerce → EXCLUDE.

CM-4a does not change CM-3c processing or Commerce.

### CM-4a-1 (complete — provider infrastructure foundation)

Ports and contracts only. No orchestration, HTTP routes, poll handler, or Prisma cursor persistence.

- `IChannelPollCursorRepository` + `ChannelPollCursor` — opaque `payload` + monotonic cursor `version` and stamped `semanticConfigVersion`; compare-and-swap via `expectedCursorVersion` plus `observedSemanticConfigVersion` (S3b)
- `InMemoryChannelPollCursorRepository` — test/dev cursor store (provider-neutral durable persistence pulled forward narrowly in **CM-4b S3b**; provider-specific polling remains deferred)
- `IChannelCredentialResolver` + `InMemoryChannelCredentialResolver` — opaque credential/webhook secret resolution
- Transport DTOs — `ChannelIngressBatchResult`, `ChannelWebhookRequestMeta`, `ChannelWebhookAckDisposition`
- `POLL_CHANNEL_CONNECTION_JOB_TYPE` — constant defined in CM-4a-1; handler implemented in CM-4a-4
- **Provider immutability** — `ChannelConnection.provider` written only on create; non-semantic updates omit provider (S3c)
- **Architecture fitness tests** — allow-list + forbidden-list scaffold (`packages/domain/tests/channels/architecture/ChannelArchitectureFitness.test.ts`)

Not in CM-4a-1: ingress orchestration, webhook adapter, poll job handler, public webhook route, real providers, `channel_poll_cursors` migration.

### CM-4a-2 (complete — stateless ingress orchestration)

Provider-agnostic webhook/poll batch orchestration terminating at `ReceiveChannelEventUseCase` only.

- `ChannelIngressBatchProcessor` — shared Receive fan-out; `ackAllowed` only when every submitted message succeeds (dedup counts as success)
- `ReceiveChannelWebhookBatchUseCase` / `ReceiveChannelPollBatchUseCase` — connection guard, provider auth policy, verify/parse/poll, provenance + identity validation, batch processing
- **Reservation ingress** — all `reservation.*` kinds (create, modify, cancel, unknown) are durably received; non-create finishes asynchronously as `UNSUPPORTED` without CM-3a/CM-3b-3/Commerce
- **Provenance failures** — provider or connection mismatch rejects the complete batch before any Receive
- **Dedup keys** — kind-specific formats for create, modify, cancel, unknown, and maintenance (`connectivity.test` when policy `receive`)
- **Provider auth policies** — `webhookAuthPolicy`, `pollAuthPolicy`, `maintenanceEventPolicy` on registration
- **Test-only transport** — `TestChannel*` providers + `createChannelIngressTestStack()`; **not wired in production DI**
- **Architecture fitness tests** — full allow-list enforcement on orchestrator files + production web DI isolation guards

Not in CM-4a-2: public HTTP routes, poll job handler, cursor persistence, production credential resolver wiring, CM-4a-3 webhook adapter.

### CM-4a-3 (complete — provider-neutral webhook transport abstraction)

HTTP-agnostic webhook transport layer converting inbound requests into `ReceiveChannelWebhookBatchUseCase` calls and ACK decisions.

- `ChannelWebhookTransportRequest` — immutable transport DTO with `Uint8Array` raw body, normalized headers, routing metadata
- `ChannelWebhookTransportResult` — provider-neutral ACK decision (`ackAllowed`, classification, failure kind, retry classification)
- `HandleChannelWebhookTransportUseCase` — transport handler; **only** reservation ingress dependency is `ReceiveChannelWebhookBatchUseCase`
- **Raw-body-before-verification** — signature verification uses immutable `rawBodyBytes`; parse occurs only after successful verification; no generic JSON reserialization before verify
- **ACK boundary** — durable Receive through `ReceiveChannelEventUseCase` (dedup counts as success); not parsing, job completion, or Booking creation
- **Partial batch** — any Receive failure denies ACK for the entire webhook request; succeeded messages remain durably received and dedupe on provider retry
- **Maintenance exception** — `connectivity.test` with `ack_without_persist` may ACK without Inbox; reservation events never bypass Receive
- **Empty valid batch** — after successful verify/parse/provenance/identity, zero selected messages ACK with zero Receive calls
- **Credential ephemerality** — credentials resolved per execution into method-local context only; never in DTOs, Inbox, jobs, or error messages
- **Error classification** — structured failure kinds with sanitized messages; credential resolver failures normalized, not leaked
- **Architecture fitness** — CM-4a-3 transport files in allow-list scope; production web DI remains unwired

**Forward invariant (CM-4a-4):** A poll cursor may advance only when `ackAllowed === true`, regardless of whether `proposedNextCursor` is present.

Not in CM-4a-3: public HTTP routes, Next.js handlers, real OTA providers, poll handler, cursor persistence, production credential resolver, production DI wiring.

### CM-4a-4 (complete — provider-neutral polling foundation)

Background-job polling transport completing symmetry with CM-4a-3 webhook abstraction.

- `ExecuteChannelPollConnectionUseCase` — load committed cursor → `ReceiveChannelPollBatchUseCase` → conditional CAS cursor commit
- `PollChannelConnectionJobHandler` — generic handler for `POLL_CHANNEL_CONNECTION_JOB_TYPE`
- `ChannelPollConnectionCommand/Result` — structured poll outcome with cursor reconciliation disposition
- `ChannelPollTransportSupport` — cursor load/advance/reconcile helpers, failure classification (mirrors CM-4a-3)
- **Cursor ownership** — loaded and committed cursors owned by platform (`IChannelPollCursorRepository`); provider returns `proposedNextCursor` only; provider never commits cursor
- **Cursor advancement rule** — advance **only** when `ackAllowed === true` **and** `proposedNextCursor !== null`
- **CAS reconciliation** — on CAS failure after durable Receive: reload committed cursor; if `reloaded.payload === proposedNextCursor` → complete; else → retry job (re-poll from reloaded cursor)
- **At-least-once polling invariant** — platform may invoke `poll()` multiple times from the same committed cursor; providers must tolerate repeated polling; platform does not guarantee exactly-once polling
- **Provider contract** — `IChannelPollingProvider.poll()` returns `nextCursor` as **proposedNextCursor**, not committed cursor
- **In-memory cursor wiring** — `InMemoryChannelPollCursorRepository` remains test-only; S3b adds the unwired durable repository, while production polling remains deferred
- **Architecture fitness** — CM-4a-4 transport files in allow-list scope; production web DI remains unwired

Not in CM-4a-4: Prisma cursor migration, production cursor repository, HTTP routes, schedulers, production DI, real providers.

### CM-4a-5 (complete — provider contract & invariant harness)

Provider-neutral certification framework exercising adapters only through approved CM-4a transport boundaries. No new runtime pipeline. Production booking flow unchanged.

- **Closed normalized ingress kinds** — `validateKnownIngressMessageKinds` rejects parsed kinds outside `ALLOWED_INGRESS_MESSAGE_KINDS` before Receive; raw provider event names remain open at the adapter layer
- **Unknown reservation policy** — unsupported reservation concepts must map to `reservation.unknown` with preserved `providerEventType`, `providerEventId`, and payload evidence; silent drops fail conformance
- **Provider contract API** — `defineWebhookProviderContract`, `definePollingProviderContract`, `defineCombinedProviderContract` (test harness under `tests/channels/contract/harness/`); polling-only fixtures do not require webhook sections (CM-4b S0a)
- **Capability-driven selection** — shared `expectations` (reservation messages + optional declared source events); webhook/poll transport sections are capability-optional
- **Contract suites** — universal reservation invariants (webhook and/or polling paths), unknown-event policy, identity/dedup, webhook, polling (including destructive-cursor failure + declared-source silent-drop), cross-transport race, security/credential, UTF-8 raw-body hardening
- **Reference conformance** — combined + polling-only reference fixtures certify `TestChannel*` simulation through harness
- **Production-safe exports** — `src/channels/contract/` exposes types, eligibility, and `ALLOWED_INGRESS_MESSAGE_KINDS` only
- **Architecture fitness** — harness scope scans, contract-src isolation, production DI harness import guards
- **Provider author guide** — `src/channels/contract/PROVIDER_AUTHOR_GUIDE.md`

Not in CM-4a-5: real providers (iCal, Booking.com, etc.), HTTP routes, schedulers, production DI, Prisma cursor persistence, CM-4b adapter, outbound sync.

### CM-4b S0a (complete — polling-only harness remediation)

Harness-only remediation so polling-only providers can certify without webhook fixtures.

- Shared `expectations` on fixtures (not under `webhook`)
- `ExpectedSourceEvent` declared-source silent-drop enforcement
- Destructive cursor declaration fails conformance
- Universal create/modify/cancel/unknown invariants execute through poll orchestration when polling-capable
- No iCal adapter, taxonomy, Prisma cursor, or production DI in this slice

Not in S0a: S1 taxonomy, iCal provider, semantic modes, migrations, schedulers, CM-4b-R.

### CM-4b S1 (complete — unknown taxonomy foundation)

Stable, versioned, provider-neutral taxonomy for `reservation.unknown` evidence. Domain types / validation / shared factory only — no iCal classification, no Booking behavior, no transport or Inbox behavior changes.

- **Mandatory envelope** — `payload.unknownClassification` with `taxonomyVersion`, `category`, `reasonCode`, optional `providerDetail`, mandatory `reclassifiable`, optional `notes`
- **Taxonomy v1 categories** — closed set: `ambiguous_reservation`, `inventory_block`, `owner_block`, `maintenance_block`, `recurring_master`, `recurrence_instance_unsupported`, `stay_changed_unhandled`, `malformed_identity`, `malformed_time`, `unsupported_vevent_feature`, `duplicate_uid`, `cancellation_unproven`, `provider_limitation`, `parser_limitation`, `future_unsupported`, `other_unclassified`
- **Versioning** — current construction version = `1`; additive reason codes within a category do not bump version; category rename/removal/split or semantic change requires a new `taxonomyVersion`
- **Reason codes** — stable `snake_case`; provider-specific detail belongs in `providerDetail` (non-secret). Optional payload alias `classificationReason` is derived from `reasonCode` only (not a second source of truth)
- **Shared factory** — `buildReservationUnknownMessage` / `buildUnknownClassificationV1` always emit taxonomy v1; classification cannot be omitted
- **Legacy readers** — historical payloads without an envelope are **not** rewritten; `readUnknownClassification` returns `other_unclassified` / `legacy_missing_taxonomy` / `reclassifiable: false` as read-only compatibility
- **Security** — envelope is evidence metadata only; must not carry credentials, feed URLs with tokens, authorization headers, or signing secrets; `providerDetail` and `notes` are documented non-secret fields
- **Exports** — production-safe types/validators/factory under `channels/types` (via package barrel); no harness/TestChannel exports

Not in S1: S0b taxonomy harness assertions, semantic modes, iCal adapter/parser, Prisma, production DI, schedulers, CM-4b-R, inventory-block processor, Booking mutation.

### CM-4b S0b (complete — taxonomy-aware harness assertions)

Harness integration of the S1 taxonomy foundation. No runtime pipeline, iCal, semantic modes, Booking, Prisma, or production DI changes.

- Reference `reservation.unknown` messages are built with `buildReservationUnknownMessage` (taxonomy v1 required)
- Harness assertions use `readUnknownClassification` / `validateUnknownClassificationV1` (not ad hoc payload inspection)
- New fixtures that emit unknown must carry a real envelope; legacy fixtures without an envelope remain interpretable via `readUnknownClassification` (`other_unclassified` / `legacy_missing_taxonomy`)
- Unknown policy suites assert taxonomy version, category, reasonCode, reclassifiable, and derived `classificationReason` consistency
- Evidence-first policy unchanged: unknown reaches Inbox; no Booking create/modify upgrade

Not in S0b: S2 semantic modes, iCal, Prisma, production DI, schedulers, CM-4b-R.

### CM-4b S2 (complete — semantic feed modes)

Provider-neutral semantic feed-mode foundation on `ChannelConnection`. Semantic mode is operator-declared trust about feed meaning — **not** Booking authorization, inventory enablement, or ACK/cursor commit bypass.

**Modes (closed, fail-closed):**

| Mode | Meaning |
|------|---------|
| `mixed_or_unknown_feed` | Default. Ambiguous or mixed meaning; evidence-first remains mandatory. |
| `availability_block_feed` | Operator declares availability/block semantics dominate. |
| `reservation_feed` | Elevated trust declaration only; **never** sufficient for `reservation.create` in base CM-4b. |

**Defaults:** new connections use `mixed_or_unknown_feed` and `semanticConfigVersion = 1`. Invalid runtime values are rejected (no silent coerce).

**Provider policy:** optional `allowedFeedSemanticModes` on `ChannelProviderRegistration`. Missing/empty allow-list → fail-closed to `[mixed_or_unknown_feed]` only.

**Booking emission:** `mayEmitReservationCreate(...)` always returns `false` in base CM-4b/S2 for all modes. CM-4b-R may later add separate eligibility/enablement gates; `reservation_feed` remains necessary-but-never-sufficient context.

**Mode-change lifecycle (`SetChannelConnectionSemanticModeUseCase`):**

1. Valid target mode + provider allow-list (Option B)
2. Permission: `channels:connection:manage:tenant` for mixed/availability; `channels:connection:declare_reservation_feed:tenant` for `reservation_feed`
3. Explicit non-secret confirmation (`confirmed` + acknowledged from/to modes)
4. Durable `commandId` required; persistence delegated to S3d atomic transition store
5. Same-mode update is a committed no-op receipt (`changed=false`; no audit, no cursor reset, no version bump)
6. No Inbox rewrite, no automatic replay, no historical reinterpretation

**Consistency (historical S2 note):** S2 used sequential cursor-reset → save → audit.
S3d replaces that path with one shared PostgreSQL transaction (see S3d below).

**Stale poll contract:** poll executions must stamp observed `semanticConfigVersion` and refuse cursor commit / result acceptance when connection version advanced (`isStaleSemanticConfigVersion` / `assertSemanticConfigVersionCurrent`). Full runtime enforcement belongs to later poll slices; S2 provides types and helpers.

**Evidence stamp:** `semanticContext: { mode, configVersion }` — immutable classification-time snapshot; not taxonomy `notes`/`providerDetail`. Suitable for future unknown payloads; does not alter S1 envelope shape in S2.

**Migration/backfill distinction:** `hydrateFromLegacyPersistence` assigns default mode + version `1` without audit or cursor reset. Operator transitions must use the use case → S3d store path only.

**Persistence:** S2 introduced domain semantic fields. S3a–S3d add schema, cursor, repository boundaries, and the atomic transition transaction. Repository reads hydrate strict persisted semantic fields (S3c).

Not in S2: Prisma persistence, iCal provider/parser/HTTP, production DI, scheduler, `reservation.create` enablement, Booking cancellation behavior, inventory-block processing, CM-4b-R.

### CM-4b S3a (complete — semantic persistence schema prerequisites)

S3a adds database schema prerequisites only. It does not make semantic-mode
management available in production and does not change the S2 domain/application
consistency model.

- `ChannelFeedSemanticMode` is persisted as the same closed three-value enum used by S2
- `ChannelConnection.semanticMode` is non-null with fail-closed database default `mixed_or_unknown_feed`
- `ChannelConnection.semanticConfigVersion` is non-null with default `1` and a positive-integer database check
- Existing connections are migration-backfilled to mixed mode/version `1`; this is infrastructure initialization, not an operator transition
- `AuditLog.resourceId` is widened from UUID storage to `VARCHAR(255)` so current string resource identities remain first-class; historical UUID values remain valid strings
- `channel_semantic_transition_commands` is a tenant-scoped provider-neutral command receipt schema, separate from audit evidence; S3a adds no command execution or transition behavior
- The command receipt table uses the existing channel-table convention: PostgreSQL RLS enabled with an `app.current_tenant` tenant policy
- Normal Prisma connection hydration uses strict persisted `semanticMode` / `semanticConfigVersion` reconstitution (S3c); the S2 legacy-default path is no longer used by the repository

The migration performs no audit insertion, cursor reset, Inbox mutation/replay,
job scheduling, Booking behavior, semantic transition, or connection activation.

Not in S3a: durable poll cursor (narrow S4 pull-forward begins in S3b), strict
repository round-trip/write boundaries (S3c), transactional semantic transitions
(S3d), activation/resume enforcement (S3e), production wiring (S3f), iCal,
HTTP, credentials, scheduler, Booking mutation, Inbox replay, or CM-4b-R.

### CM-4b S3b (complete — narrow durable cursor foundation)

S3b is the explicitly approved narrow pull-forward from the future S4 cursor
slice. It adds only the provider-neutral persistence required for atomic
semantic reset in S3d and repository-level stale-semantic-epoch rejection.

- `channel_poll_cursors` has composite tenant/connection identity and a cascading composite FK to `channel_connections`
- Cursor payload is opaque text; neither domain nor persistence interprets its format
- Persisted cursor version and semantic config version are positive integers and hydrate strictly
- Create requires expected cursor version `0`, stores version `1`, and stamps the semantic version observed by the caller
- Update locks ChannelConnection first, validates the current semantic epoch, then locks/validates the cursor and increments its version exactly once
- Delete remains the idempotent reset mechanism and uses the same connection-first lock order
- PostgreSQL writes run in, or participate in, a transaction and set tenant context inside that transaction
- The in-memory repository enforces the same cursor and semantic CAS rules
- RLS uses the established channel-table `app.current_tenant` policy without `FORCE ROW LEVEL SECURITY`

The existing provider-neutral test/simulation polling path passes the connection
semantic version observed at poll start into cursor commit. This contract
adaptation does not activate production polling.

No polling payload format, iCal implementation, HTTP fetcher, scheduler
registration, production poll DI, semantic transition transaction, activation
change, Booking behavior, or Inbox replay is included. Semantic management must
not coexist with production polling that can commit without the observed
semantic version. Production polling remains unavailable.

S3b is complete. Later slices: S3c repository semantic persistence (complete),
S3d atomic semantic transition (complete), S3e activation/resume governance
(complete), S3f production semantic-mode management wiring (complete).

### CM-4b S3c (complete — repository semantic persistence)

S3c makes persisted semantic fields the repository source of truth and removes
the production repository's legacy semantic defaulting path.

- `findById` / `listByTenant` hydrate `semanticMode` and `semanticConfigVersion` strictly through `ChannelConnection.reconstitute`
- `create` is the only insert path and always stores `mixed_or_unknown_feed` at version `1`
- `saveNonSemanticChanges` updates profile fields only and physically omits `status`, semantic columns, and provider
- `persistSemanticState` is the only repository path that mutates semantic columns, and it requires expected semantic-version CAS
- `activateWithExpectedSemanticVersion` / `resumeWithExpectedSemanticVersion` persist lifecycle status under semantic-version, expected-status, and credential-presence CAS (S3e strengthens credential CAS)
- Restricted `pause` / `markError` / `disconnect` helpers CAS lifecycle status without writing `active`
- Provider identity remains immutable after create
- In-memory and PostgreSQL repositories share these write boundaries
- Repository methods participate in caller-owned transactions without nesting

S3c does not implement semantic transition orchestration, command receipt
execution, activation approval policy, production polling, or production DI.
Those belong to S3d–S3f. The S2 semantic-mode use case is adapted in S3d to call
the atomic transition store.

### CM-4b S3d (complete — atomic semantic transition transaction)

S3d coordinates command receipt, semantic CAS, cursor reset, and audit in one
PostgreSQL transaction via `IChannelSemanticModeTransitionStore`.

- Durable key `(tenantId, operation, commandId)` with operation `channel.connection.set_semantic_mode`
- Canonical length-prefixed UTF-8 fingerprint `cm4b-s3d-fingerprint-v1` (see `docs/cm-4b-s3d-atomic-transition.md`)
- Claim pending receipt in-TX; committed matching fingerprint replays stored result
- Fingerprint mismatch → `IdempotencyConflictError` with no mutation
- Changed transition: `resultingVersion = previousVersion + 1`, cursor reset, one audit
- Same-mode: committed no-op receipt, no audit, no cursor reset, no version bump
- Lock order: receipt → ChannelConnection → ChannelPollCursor
- `SetChannelConnectionSemanticModeUseCase` delegates persistence only to the store
- In-memory store provides logical parity; PostgreSQL remains authoritative for locking
- Production DI/HTTP wiring is S3f; pre-release fingerprint v1 requires no receipt migration

Not in S3d: activation approval (S3e), production semantic management HTTP (S3f),
polling, iCal, credentials, Booking, Inbox replay, pending-command recovery
workers.

### CM-4b S3e (complete — lifecycle activate/resume under semantic policy & epoch CAS)

S3e adds application use cases that activate/resume connections only when semantic
policy and the observed semantic epoch allow it. See
`docs/cm-4b-s3e-lifecycle-activation.md`.

- `ActivateChannelConnectionUseCase` — sources `pending_auth` | `error` → `active`
- `ResumeChannelConnectionUseCase` — source `paused` → `active`
- Mandatory `expectedSemanticConfigVersion` on every command
- Authorization order: manage → load → reservation_feed elevate → provider allow-list → aggregate gates → prior status → domain mutate → TX(CAS+audit)
- Application-owned interactive transaction: lifecycle CAS + audit; repository participates without nesting
- CAS includes status, semantic epoch, and `credential_ref IS NOT NULL`
- Audit: `channel.connection.activated` / `channel.connection.resumed`
- `saveNonSemanticChanges` cannot persist `status`; only activate/resume helpers write `active`
- Restricted pause/error/disconnect primitives never write `active`
- No cursor reset, no semantic column mutation, no S3d store dependency, no migration
- Non-idempotent retries after success → `ConflictError` (no lifecycle receipts)
- S3d may still change mode while `active`; S3e↔S3d races covered by epoch CAS
- Production HTTP/DI for activate/resume optional in S3e; semantic-mode management is S3f

Not in S3e: S3f semantic-mode HTTP/UI, lifecycle receipts, semantic activation state,
polling, iCal, Booking emission, migrations.

### CM-4b S3f (complete — production semantic-mode management wiring & operator exposure)

S3f wires production DI and admin HTTP for semantic configuration read/set.
See `docs/cm-4b-s3f-production-semantic-management.md`.

- `GetChannelConnectionSemanticConfigurationUseCase` — thin read; no store/cursor/audit
- `SetChannelConnectionSemanticModeUseCase` — sole mutation path; mandatory
  `expectedSemanticConfigVersion`; confirmation server-enforced; XOR permissions
- Routes: `GET|PUT /api/admin/v1/channel-connections/:connectionId/semantic-mode`
- Feature gate `CHANNELS_SEMANTIC_MODE_API_ENABLED === "true"` (default off → 404 after auth)
- Body-authoritative `commandId`; optional `Idempotency-Key` must match body
- Production DI: one `PrismaChannelSemanticModeTransitionStore` + one set-mode use case
- Fingerprint remains `cm4b-s3d-fingerprint-v1`; `IDEMPOTENCY_CONFLICT` → HTTP 409
- Lifecycle status unchanged; no auto activate/resume; no S3e HTTP; no UI; no migration

Not in S3f: polling, Inbox replay, reservation emission, Booking creation, S3e HTTP, UI.

### CM-4b S4a-1 (complete — operator foundation)

S4a-1 wires production operator connection, credential, and lifecycle HTTP.
See `docs/cm-4b-s4a1-operator-foundation.md`.

- Create / List / Get / UpdateMetadata use cases (provider immutable; metadata =
  displayName only)
- Sealed credential store (`IChannelCredentialStore` + `PrismaChannelCredentialVault`)
- Pause / Disconnect use cases; Activate / Resume production HTTP (S3e CAS reused)
- Feature gate `CHANNELS_OPERATOR_API_ENABLED === "true"` (default off → 404)
- Migration: `channel_secret_records` only
- Fingerprint remains `cm4b-s3d-fingerprint-v1`; emission remains disabled
- Master key: fail-closed lazy parse; **no** deterministic placeholder key in DI

Not in S4a-1: webhook/poll HTTP, provider registry bootstrap, replay HTTP,
transport status, providers, iCal, Booking emission, UI (those are S4a-2+).

### CM-4b S4a-2a (complete — DI, registry bootstrap & poll-job wiring)

S4a-2a composes approved CM-4a transport into production DI and registers the
poll job handler behind a feature gate. See `docs/cm-4b-s4a2a-transport-di-wiring.md`.

- `CHANNELS_ENABLED_PROVIDERS` bootstrap (empty allow-list = healthy empty registry)
- Zero production provider factories (no TestChannel / real OTA)
- Wire: batch processor, webhook/poll batch UCs, webhook transport UC, execute-poll UC
- Same `PrismaChannelCredentialVault` as store + resolver (lazy master key unchanged)
- `PrismaChannelPollCursorRepository` in production DI
- `PollChannelConnectionJobHandler` registered once via `PollingFeatureGatedPollJobHandler`
- `CHANNELS_POLLING_ENABLED === "true"` required for poll execution; otherwise safe no-op
- No migration; fingerprint / emission invariants unchanged

Not in S4a-2a: public webhook HTTP, manual poll/replay/status routes, automatic
poll scheduling, any real provider (those are S4a-2b / Provider-1).

### CM-4b S4a-2b (complete — webhook & admin transport HTTP)

S4a-2b exposes HTTP for the S4a-2a transport composition.
See `docs/cm-4b-s4a2b-transport-http.md`.

- `POST /api/channels/v1/webhooks/:provider/:tenantId/:connectionId` (Node runtime,
  raw-body, 1 MiB limit, `CHANNELS_WEBHOOK_API_ENABLED`)
- `POST .../channel-connections/:connectionId/poll` (enqueue only;
  operator + polling flags)
- `POST .../inbox/:inboxItemId/replay` (operator + replay flags)
- Production registry remains empty; no real provider; no migration; no status route

Not in S4a-2b: opaque webhook token, automatic schedule, transport-status, Provider-1,
Booking emission.

### Provider-1 (iCal) — P1-S0 architecture lock-in

CM-4b S4a is closed. Provider-1 begins as a **polling-only inbound evidence
adapter** for first-property validation — not an OTA API and not a Booking
creator.

Authoritative docs:

- `docs/adr/023-provider-1-ical-inbound-evidence-adapter.md`
- `docs/cm-4b-p1-s0-ical-architecture-lock-in.md`

Locked roadmap: P1-S0 … P1-S9 (Inventory Applicator before first-property pilot).
P1-S0 is documentation only: no runtime registration, migration, fetch, parser,
inventory mutation, or schedule. MVP registers **polling only**
(`reservationImport` / `availabilityExport` false). Inventory apply is separate
(P1-S6); current EXCLUDE covers hold/booking only unless extended later.

**P1-S1 (registration skeleton):** `createIcalProviderRegistration` and
`PRODUCTION_CHANNEL_PROVIDER_FACTORIES.ical` exist. Factory presence does **not**
enable the provider — default empty `CHANNELS_ENABLED_PROVIDERS` still yields an
empty live registry. Registration requires injected `IIcalFeedFetcher` (web:
`domainIcalFeedFetcher` → `NodeSsrfSafeIcalFeedFetcher`).

**P1-S2 (SSRF-safe fetch capability):** `NodeSsrfSafeIcalFeedFetcher` exists under
`apps/web/lib/channels/ical/` as an infrastructure-local transport capability,
adapted to domain `IIcalFeedFetcher` via `domainIcalFeedFetcher`. Wired into
`createIcalProviderRegistration` only when the provider is allow-list registered.

**P1-S3 (ICS parse + normalize):** `parseIcalCalendar(rawBytes)` exists under
`packages/domain/src/channels/providers/ical/parse/` as a provider-adapter
normalizer. Used by `IcalPollingProvider` when polling is invoked (still gated
operationally by `CHANNELS_ENABLED_PROVIDERS` / `CHANNELS_POLLING_ENABLED`).

**P1-S4a (snapshot / identity / hash / opaque cursor codec):** **CLOSED.** Pure domain
APIs under `packages/domain/src/channels/providers/ical/map/`
(`buildIcalSnapshotIndex`, `toIcalDigestIndex`, `encodeIcalCursor`,
`decodeIcalCursor`, `decodeIcalIdentityKey`).

**P1-S4b (diff / classification / mapped evidence):** **CLOSED** (closure hygiene
complete). APIs: `diffIcalSnapshotIndexes`, `classifyIcalSnapshotDiff`,
`mapIcalCalendar`. Produces `IcalMappedEvidenceBatch` with provider-local evidence
records and `proposedCursorPayload` only — **no** `ChannelProviderMessage`, **no**
Inbox, **no** cursor persistence/CAS.

**P1-S5 (poll → trusted ingress → Receive → ACK → cursor CAS):** **CLOSED.**
Independent implementation review: **APPROVED WITH MINOR OBSERVATIONS** (BLOCKER: 0,
MAJOR: 0). `IcalPollingProvider.poll()` / `pollTrustedIngress()` executes fetch →
parse → map → trusted ingress build. Trusted dedup identity is computed in domain
ingress (`icalIngressIdentityCodec`, `buildIcalInboundIngressItems`) and passed via
iCal-only `IIcalTrustedIngressPollingProvider` through `ChannelIngressBatchProcessor`
to `ReceiveChannelEventCommand.deduplicationKey` — provider payload cannot select
Inbox dedup identity. Dedup key: `ingress:ical:v1:<64hex>` (80 chars). Message id:
`ical-msg-v1-<64hex>` (76 chars). `occurrenceOrdinal` disambiguates identical twins.
Cursor issue diagnostics (`CURSOR_INVALID`, `CURSOR_UNSUPPORTED_VERSION`) are
reported from `ReceiveChannelPollBatchUseCase` (has `tenantId`), not inside the
provider. Provider-1 is **not** operationally activated by merge/deploy alone
(`CHANNELS_ENABLED_PROVIDERS`, `CHANNELS_POLLING_ENABLED` gates unchanged).

**P1-S5 closure invariants (unchanged):** S4a/S4b map semantics untouched;
`mapIcalCalendar` remains pure; `identityKey` authoritative; `providerEventId`
informational/non-unique; `occurrenceOrdinal` deterministic; iCal dedup key 80 chars;
messageId 76 chars; trusted dedup payload-independent; Receive ACK before cursor CAS;
no inventory/Booking/Commerce mutation; `mayEmitReservationCreate === false`; no
migration added.

**P1-S6a (inventory commit foundation — schema + TX1 orchestration hook):** **IMPLEMENTED
(code).** Architecture approval: targeted final re-review **APPROVED WITH MINOR
OBSERVATIONS**. Scope is S6a only:

- Schema: `CalendarBlockType.channel_import` (not in hold/booking EXCLUDE; not exposed
  to operator create API), `channel_inventory_reconciliations`,
  `outbox_events.delivery_key` (nullable + partial unique)
- FULL DATE actionable projection from CURRENT `IcalSnapshotIndex` (not S4b deltas);
  compact encoding; capacity fail-closed before TX1
- Phantom-safe `ChannelListingMapping` writes (connection `FOR UPDATE` first)
- Atomic TX1 when `CHANNELS_INVENTORY_APPLY_ENABLED=true` and iCal
  `availability_block_feed`: connection lock → mapping validation → cursor CAS →
  generation insert → durable reconcile outbox (pending only)
- Flag default **OFF** → unchanged P1-S5 cursor-only CAS
- Explicit `committedCursorVersion` on poll result (never inferred as loaded+1)
- Empty actionable snapshot with complete observed evidence → generation `pending` +
  durable reconcile outbox (so TX2 can soft-release under authoritative empty)
- **No** UnitCalendarBlock mutation in TX1, **no** TX2 reconcile apply in S6a alone,
  **no** S6b/S6c

**P1-S6a PostgreSQL verification:**
COMPLETE (real Supabase PostgreSQL)

Migration `20260906120000_p1_s6a_inventory_commit_foundation` applied via
`prisma migrate deploy`. Schema up to date. Focused S6a integration suite
`ChannelPollInventoryCommit.s6a.integration.test.ts` passed against live PG.

**P1-S6b:** Implementation complete — pending independent closure review.
Uses TX2 apply of durable S6a snapshots into `UnitCalendarBlock(blockType=channel_import)`,
typed outbox enqueue, reconcile/sweep jobs, and force-redrive for dead_letter/cancelled.

**Deleted-connection invariant (corrected):**
`channel_inventory_reconciliations.connection_fkey` is `ON DELETE CASCADE`.
Deleting a `channel_connection` **authoritatively destroys** pending/applied/failed
reconciliation rows for that connection. There is **no durable** `reconcile_status=failed`
row after deletion. A stale queued `reconcile_ical_imported_inventory` job then observes
`connection_not_found`, returns terminal `PERMANENT_FAIL` with `shouldRetryJob=false`
(result DTO may say `reconcileStatus: failed` but that is **not** durable DB state),
writes **no** `channel_import` blocks, and the job completes without retry/dead-letter storm.
`channel_listing_mappings`, `outbox_events`, and `background_jobs` are **not** FK-cascaded.
`unit_calendar_blocks.connection_id` has **no** FK — already-materialized `channel_import`
blocks **survive** connection deletion until disconnect/deactivate cleanup runs.
Same-epoch authoritative soft-release is **P1-S7a**; superseded-epoch release runs
on rotation / mapping epoch bump; disconnect releases all connection-owned imports.

**P1-S6c:** **IMPLEMENTED (not activated).** Credential rotation, mapping
lifecycle, and async lifecycle gates. Provider-1 remains **not** operationally
activated; inventory apply stays default OFF and `mayEmitReservationCreate`
remains `false`.

Migration: `20260912180000_p1_s6c_ical_credential_rotation` adds
`channel_ical_credential_rotation_commands` (PK `(tenant_id, operation, command_id)`,
RLS `app.current_tenant` tenant policy, index on
`(tenant_id, connection_id, created_at)`, and a partial unique index enforcing at
most one `in_progress` rotation per `(tenant_id, connection_id)`). The receipt
stores opaque credential references plus non-secret digests only — never feed
URLs, tokens, or credential material.

**Credential rotation (`RotateIcalConnectionCredentialsUseCase`, phases 0–5):**

- Operation identity `channel.connection.rotate_ical_credentials`; fingerprint
  format `p1-s6c-rotation-fingerprint-v1` over non-secret material (credential
  material contributes a SHA-256 digest of canonical sorted `key=value` pairs)
- Phase 0 precheck — `channels:connection:manage:tenant`, provider `ical`,
  material must carry `feedUrl`, optional `expectedSemanticConfigVersion` CAS,
  no other `in_progress` rotation for the connection
- Phase 1 — short TX: lock connection, pause when `active`, insert/claim the
  `in_progress` receipt. **No vault I/O while PostgreSQL locks are held.**
- Phase 2 — `putCredential` outside any transaction, then `markVaultWritten`
  records the opaque reference. Secrets never reach logs, audit, or the receipt.
- Phase 3 — short TX: connection → mappings → pending reconciliations (S6b lock
  order); validates paused + `in_progress`; replaces `credential_ref`; bumps the
  semantic epoch by one; `resetPollCursorBaseline` with
  `EMPTY_ICAL_CURSOR_BASELINE_PAYLOAD` retaining the durable cursor version;
  supersedes pending reconciliations; marks the receipt committed; audits
  `channel.connection.ical_credentials_rotated`
- Phase 4 — best-effort `deleteSecret(previous)`; failures log
  `vault_cleanup_failed` only
- Phase 5 — **no auto-resume**; the operator must resume explicitly
- Idempotency — retrying the same `commandId` after the vault write reuses the
  stored `new_credential_ref` and never commits a second epoch; a fingerprint
  mismatch raises `IDEMPOTENCY_CONFLICT` with no mutation

**Fail-closed credential attach:** `PutChannelConnectionCredentialsUseCase`
refuses `ical` connections in `active` or `paused` status
(`ical_rotation_required`) and directs the operator to the rotation use case.
`draft` / `pending_auth` / `error` attach paths are unchanged.

**Async gates:**

- `prepareLifecycleActivation` takes an optional rotation gate; activate/resume
  are refused while an `in_progress` rotation exists (`rotation_in_progress`)
- `SweepPendingIcalInventoryReconcileUseCase` checks connection status through an
  injected `IChannelConnectionStatusFinder` before enqueue, skips non-`active`
  connections with `reasonCode: lifecycle_not_active`, and reports
  `skippedLifecycle`
- `ForceRedrivePendingIcalInventoryReconcileUseCase` fails closed unless the
  connection is `active`

**Mapping lifecycle (`IIcalChannelMappingLifecycleStore`):** one short TX under
`channel_connections FOR UPDATE`, preserving connection → mappings →
reconciliation → blocks. Mutation classification:

| kind | epoch bump | cursor baseline + supersede | connection must be |
|------|-----------|------------------------------|--------------------|
| `create` | no | no | active or paused |
| `property_only` | no | no | active or paused |
| `external_identity_only` | no | no | active or paused |
| `unit_change` | yes | yes | paused |
| `replacement` | yes | yes | paused |
| `deactivate` | yes when the mapping was active | yes | paused |

`UpsertChannelListingMappingUseCase` and
`DeactivateChannelListingMappingUseCase` require
`channels:connection:manage:tenant`, preserve exactly-one-active mapping for
`ical` + `availability_block_feed`, and always report
`requiresPollRematerialization: true` — the operator workflow is
pause → mutate → resume → poll. Same-epoch absences are soft-released by **P1-S7a**
after the next authoritative poll. **Superseded-epoch** `channel_import` rows are
soft-released on credential rotation / mapping epoch bump. **Disconnect** and
**inventory/deactivate** release all connection-owned active `channel_import`.

**Operator HTTP (behind `CHANNELS_OPERATOR_API_ENABLED`):**

- `POST .../channel-connections/:connectionId/credentials/rotate`
- `PUT  .../channel-connections/:connectionId/mappings`
- `POST .../channel-connections/:connectionId/mappings/:mappingId/deactivate`

Not in P1-S6c historically: Booking behavior, reservation emission.
Superseded-epoch / disconnect `channel_import` cleanup is now implemented
(rotation + mapping epoch bump + disconnect cleanup store).

**P1-S7a (authoritative same-epoch inventory soft-removal):** **IMPLEMENTED (code;
pending independent closure review).** Scope is S7a only:

- Soft-deactivate via existing `CalendarBlockStatus.released` (no `inactive` enum)
- Durable generation evidence: `complete_observed_evidence`,
  `observed_source_identity_keys`, `cancelled_source_identity_keys`
- Observed vs actionable: present-but-non-actionable identities are **retained**;
  true absence from observed → `released`; explicit `STATUS:CANCELLED` → `released`
- Authoritative empty VCALENDAR (observed `[]`) → TX1 `pending` + outbox → TX2
  releases all active `channel_import` under the current ownership fence
- Incomplete/missing observed evidence → **never** absence-deactivate (fail closed)
- Ownership fence: `channel_import` + `active` + tenant/connection/epoch/mapping/unit
- Reappearance inserts a **new** active row; historical `released` rows remain
- Same-epoch authoritative soft-release (**P1-S7a**)
- Superseded-epoch release on rotation / mapping epoch bump
- Disconnect + inventory/deactivate release all connection-owned `channel_import`
- Atomic TX2: upsert desired → release absentees/cancelled → mark applied

Migration: `20260913120000_p1_s7a_observed_inventory_evidence`.

**P1-S7b (operational readiness — automation-capable, not pilot-activated):**
**IMPLEMENTED (code; pending independent closure review).** Schema-free.

Provider-1 after S7b is:

- automation-capable
- operationally observable
- recoverable
- rollback-safe

It is **not** pilot-activated. External production cron + real-feed pilot
verification remain after **P1-S7c Phase 1** (connection fence code).

**Scheduled poll identity (Option A time buckets):**

```text
intervalMs = CHANNELS_ICAL_POLL_INTERVAL_MS | 15m (min 5m)
bucket = floor(utcNowMs / intervalMs)
schedKey   = poll_channel_connection:{tenant}:{connection}:sched:{bucket}
manualKey  = poll_channel_connection:{tenant}:{connection}:manual:{bucket}
recoveryKey= poll_channel_connection:{tenant}:{connection}:recovery:{deadLetterJobId}
```

- Jitter `0 → 10% of interval` applies to `runAt` only — never the key.
- Connection-level in-flight gate: any `pending|processing` poll (including
  retry-scheduled pending) → reuse existing; no overlapping enqueue.
- Scheduler never auto-recovers `dead_letter` polls (health: `poll_job_dead_letter`).
  Admin manual poll uses `recovery:{deadLetterJobId}` for explicit recovery.
- Pause/resume alone does not enqueue recovery.

**Internal scheduler:**

- `POST /api/internal/v1/channels/schedule-ical-polls`
- Auth: `Authorization: Bearer ${BACKGROUND_JOBS_SECRET}`
- Enumerates eligible: `ical` + `availability_block_feed` + `active` +
  credentialRef + exactly one active mapping + `CHANNELS_POLLING_ENABLED`
- Does **not** require inventory apply (global or connection) — polls while apply OFF
- Same invocation enqueues at most one `sweep_pending_ical_inventory_reconcile`
  per bucket key `sweep_pending_ical_inventory_reconcile:sched:{bucket}`
- Sweep does **not** auto-redrive dead_letter/cancelled reconcile jobs
- Sweep requires global apply ON **and** connection `inventory_apply_enabled`

**Suggested external cadence (documented only — activation is post Phase 1):**

```text
Prefer always-on worker (apps/worker):
  LISTEN/NOTIFY wake + ~1–3s recovery sweep
  → ProcessJobBatchUseCase / ProcessOutboxBatchUseCase (direct)

  Scheduler hooks (independent cadences; enqueue-only):
    ~15m  iCal → ScheduleIcalPollsUseCase
    ~60s  hold expiry → enqueue expire_holds
    future OTA retrieval → ReceiveChannelEventUseCase only

Ops / manual / recovery HTTP (unchanged):
  POST /api/internal/v1/outbox/dispatch
  POST /api/internal/v1/jobs/run
  POST /api/internal/v1/channels/schedule-ical-polls
```

**Execution model:** PostgreSQL remains the durable source of truth.
`apps/worker` is the primary execution + scheduling process.
Cron is **not** the primary reservation-critical execution engine.
See `docs/talos-event-driven-async-worker.md`.

Existing `jobs/run` + `outbox/dispatch` + `schedule-ical-polls` remain ops/recovery HTTP surfaces.
The worker invokes use cases directly and does not call these endpoints.

**Operator HTTP (behind `CHANNELS_OPERATOR_API_ENABLED`):**

- `POST .../channel-connections/:connectionId/reconciliations/:cursorVersion/force-redrive`
  — uses `ForceRedrivePendingIcalInventoryReconcileUseCase`; durable audit;
  requires `CHANNELS_CONNECTION_MANAGE` + global apply + connection apply +
  active connection + pending generation + latest job dead_letter|cancelled
- `GET  .../channel-connections/:connectionId/health` — derived health DTO
  (no new columns); attention codes:
  `poll_job_dead_letter`, `reconcile_job_dead_letter`,
  `reconcile_job_cancelled_with_pending_generation`,
  `pending_reconciliation_without_runnable_job`,
  `poll_stale_beyond_2x_interval`, `rotation_in_progress`
- `POST .../channel-connections/:connectionId/inventory/deactivate` —
  emergency rollback: pause if active + release **all** active
  `channel_import` for that connection (all epochs/mappings/units); never
  touches Hold/Booking/other connections; idempotent when already paused

### P1-S7c Phase 1 — connection-level inventory apply fence

**Status:** Phase 1 **code** may be complete; this is **not** controlled-pilot
activation. Real-feed / production cron / production apply remain separate.

**Schema:** `channel_connections.inventory_apply_enabled BOOLEAN NOT NULL DEFAULT false`

**Mutation predicate (fail-closed):**

```text
CHANNELS_INVENTORY_APPLY_ENABLED
AND connection.inventory_apply_enabled
AND status = active
AND provider = ical
AND semanticMode = availability_block_feed
AND exactly one complete active mapping
```

**Layers:** L1 global env → L2 connection bit → L3 lifecycle → L4 mapping/epoch
fences → L5 TX2 live connection-lock re-check → L6 inventory/deactivate.

**Polling while connection apply OFF:** scheduler/manual/recovery polls continue;
cursor advances (S5 cursor-only); no inventory generation/apply.

**Linearization:** `channel_connections … FOR UPDATE` serializes TX2, enable, and
disable. After disable returns, no subsequent TX2 may write until re-enable.
TX2 already holding the lock may finish atomically (not retroactively cancelled).

**Enable** (`POST .../inventory-apply/enable`):

- Requires global apply ON, operator API, session, `CHANNELS_CONNECTION_MANAGE`,
  `expectedSemanticConfigVersion`
- Same TX under connection lock: supersede pending where
  `cursorVersion < committedPollCursor.version` (or all pending if no cursor);
  retain pending at current cursor; set apply true; audit
  `channel.connection.inventory_apply_enabled` (+ `supersededPendingCount`)
- Promise A: non-stale current-cursor pending may apply immediately after enable
- Does not auto-poll

**Architecture refinement (eligibility — locked during Phase 1 implementation):**

```text
While connection-level apply is OFF, pending_reconciliation_without_runnable_job
by itself is NOT an enable / pilotEligible blocker when the lack of runnable
work is an intentional consequence of the apply fence (Sweep skips enqueue).

Hard blockers remain (apply OFF or ON):
  poll_job_dead_letter
  reconcile_job_dead_letter
  reconcile_job_cancelled_with_pending_generation
  rotation_in_progress
  invalid lifecycle / mapping / credential / provider / mode
  global_inventory_apply_disabled

When connection apply is already ON, pending without a runnable reconcile job
IS an enable / pilotEligible blocker (stuck recovery — not ForceRedrive substitute).

Health.pilotEligible and EnableChannelConnectionInventoryApplyUseCase share
collectInventoryApplyEnableEligibilityReasons (must not disagree).
```

**Disable** (`POST .../inventory-apply/disable`): fence OFF only; pending remain
pending; does not release inventory (use deactivate for emergency clear).

**Rollback sequence:** disable → `inventory/deactivate`.

**Health fields:** `inventoryApplyGloballyEnabled`, `inventoryApplyForConnection`,
`inventoryApplyEffective`, `pilotEligible`, `pilotEligibilityReasons[]`,
`activeChannelImportCount`. Connection apply OFF alone does not make
`pilotEligible` false. Intentional frozen pending (apply OFF) does not emit
`pending_reconciliation_without_runnable_job` as attention.

**P1-S6 / operational activation blocker:** Provider-1 remains **not**
operationally activated and **not** customer-ready until post–Phase 1 real-feed
GO. Inventory apply defaults OFF; `mayEmitReservationCreate === false`.

Provider-1 code path exists. Provider-1 is **not** operationally activated and is
**not** customer-ready. Poll→Inbox transport is closed at P1-S5; inventory apply
foundation is **P1-S6a–S7a**; operational readiness surfaces are **P1-S7b**;
connection fence is **P1-S7c Phase 1** (activation remains subsequent).

Constitutional invariants remain: ADR-022, Inbox-first ingress, opaque cursor CAS,
vault credentials, `mayEmitReservationCreate === false`, fingerprint
`cm4b-s3d-fingerprint-v1`.

### CM-1a scope

Domain types and split provider contracts:

- `ChannelSource`, capability flags, provider messages, export deltas
- Split provider interfaces (auth, webhooks, polling, import, availability export, rate/restriction export, optional reservation export)
- `ChannelProviderRegistration` + `IChannelProviderRegistry` / `ChannelProviderRegistry`

## CM-1b scope

`ChannelConnection` aggregate and repository port:

- Opaque `CredentialReference` and `WebhookVerificationReference` value objects
- Lifecycle: draft → pending_auth → active; pause/resume; error; disconnect
- **Activation invariant:** a connection may become `active` only after a valid `CredentialReference` is attached
- Domain does not distinguish OAuth, API keys, iCal URLs, or webhook secrets — infrastructure decides what a reference points to
- `IChannelConnectionRepository` + in-memory fake for tests

No credential storage, encryption, OAuth, HTTP, or persistence in CM-1b.

## CM-1c scope

`ChannelListingMapping` aggregate and repository port:

- Links external listing/unit IDs to internal `propertyId` / `unitId` under a `connectionId`
- Sync metadata only — Catalog remains source of truth for properties and units
- `mappingVersion` increments only on structural changes (internal, external, or sync direction)
- Status lifecycle: active, paused, unmapped, error, archived
- `IChannelListingMappingRepository` + in-memory fake

No Catalog/Commerce writes, persistence, or provider adapters in CM-1c.

## CM-1d scope

`ExternalReservationLink` aggregate and repository port:

- Canonical sync metadata linking `(connectionId, externalReservationId)` to internal `bookingId`
- **Booking remains the single source of truth** — the link never owns reservation state
- Frozen `mappingVersionAtImport` and mutable `mappingVersionAtLastSync`
- Opaque `externalRevision` and optional `lastExternalUpdateAt` for provider-agnostic ordering
- Status lifecycle: linked, stale, conflict, archived
- A Commerce booking may have **multiple** external links (e.g. OTA + iCal, channel migration); use `listByBookingId` to enumerate all references
- Uniqueness remains on `(connectionId, externalReservationId)`; `findByBookingId` returns the most recently synced link for convenience
- `IExternalReservationLinkRepository` + in-memory fake

No provider payloads, Commerce writes, persistence, or webhook/polling logic in CM-1d.

## CM-1e scope

In-memory end-to-end channel simulation (architectural proof):

- `FakeChannelProviderBundle` registered in `ChannelProviderRegistry`
- `ChannelImportSimulation` orchestrates: connection → listing mapping → normalized command → external reservation link
- Fake provider messages contain **provider-side identifiers only** (external listing/reservation, stay, guest, revision)
- Internal `propertyId` / `unitId` / `mappingVersion` come **only** from `ChannelListingMapping`
- Stops at `NormalizedReservationCommand` — no Commerce or `ReservationOrchestrator`
- `ExternalReservationLink` uses a simulated `bookingId` placeholder until CM-3c

No database, HTTP, async jobs, or real OTA adapters in CM-1e.

**Superseded:** CM-1e simulation was an architecture proof only. The production import path is **CM-3a** (`ImportChannelReservationCreateDryRunUseCase`) + **CM-3b-3** (`ImportChannelReservationCommandUseCase`). Simulation code remains under `channels/simulation/` for tests only and is **not** exported from `@hcp/domain`.

## Provider contracts

Providers are **split by responsibility**. Adapters implement only supported interfaces. Registration enforces capability ↔ interface pairing.

**Core outbound:** availability export, rate export, restriction export.

**Optional outbound:** reservation export (not assumed for all providers).

**Credentials:** stay outside the domain — only opaque references on `ChannelConnection`.

## Dependency direction

- Channels imports `NormalizedReservationCommand` from Commerce (create import mapping only).
- Commerce never imports Channels provider models.
- Inbound: adapter → `ChannelProviderMessage` → import mapping → Commerce use cases → `ReservationOrchestrator`.
- Outbound: Commerce outbox events → channel export jobs → provider export interfaces.
