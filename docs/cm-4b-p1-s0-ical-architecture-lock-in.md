# Provider-1 P1-S0 — iCal Architecture Lock-in

**Status:** Locked (documentation only for P1-S0)  
**Implementation note:** P1-S1 registration skeleton landed — iCal factory exists;
factory ≠ enablement; default registry remains empty; polling skeleton fail-closed.
**P1-S2:** SSRF-safe feed fetcher exists under `apps/web/lib/channels/ical/`
(infrastructure-local); live `IcalPollingProvider.poll()` still performs no DNS
or network I/O.
**P1-S3:** `parseIcalCalendar` exists under domain `providers/ical/parse/`
(provider-adapter bytes → `NormalizedIcalCalendar`); live poll still performs
zero DNS / zero fetch / zero parse.
**P1-S4a:** snapshot/identity/hash/opaque cursor codec exists under
`providers/ical/map/`; no diff/classify/messages/Inbox/cursor persistence;
live poll still fail-closed (zero map); P1-S4b/P1-S5 remain next.  
**ADR:** [023 — Provider-1 (iCal) inbound evidence adapter](./adr/023-provider-1-ical-inbound-evidence-adapter.md)  
**Subordinate to:** ADR-022, ADR-009, ADR-010, ADR-014, Channel `ARCHITECTURE.md`, CM-4b S4a-1/2a/2b  

This document locks Provider-1 boundaries before implementation. Later slices must
not silently change these decisions. Runtime code is unchanged by P1-S0.

---

## 1. Provider identity

| Decision | Value |
|----------|--------|
| Provider id | `"ical"` (`ChannelSource`) |
| Immutability | `ChannelConnection.provider` set only on create; non-semantic saves omit provider (S3c / S4a-1) |
| MVP cardinality | **One connection = one remote iCal feed** |
| Multi-feed future | Allowed later via credential material / child feed records **without** changing `IChannelPollingProvider` ports |
| Inbox special-casing | **Forbidden** — iCal uses the same Receive / Inbox / Replay / Process pipeline |

Symbols: `ChannelSource` / `CHANNEL_SOURCES` in
`packages/domain/src/channels/types/ChannelSource.ts`.

---

## 2. Provider boundary (`ICalPollingProvider`)

Conceptual implementation of `IChannelPollingProvider` only.

### May own

- Credential material interpretation (`feedUrl`, future optional auth fields)
- SSRF-safe remote HTTP fetch
- Conditional requests (ETag / Last-Modified)
- ICS byte parsing
- VEVENT normalization
- Snapshot diff
- Mapping to `ChannelProviderMessage`
- Proposed opaque cursor creation (`nextCursor` / proposedNextCursor)

### Must not own

- Cursor persistence or CAS (`IChannelPollCursorRepository` / Execute poll UC)
- Inbox writes (`ReceiveChannelEventUseCase`)
- Process-job scheduling
- Replay orchestration
- Booking creation / reservation emission
- Commerce writes / `UnitCalendarBlock` writes
- Connection lifecycle mutation (`activate` / `pause` / `markError` callers are platform)
- Global polling schedules
- Operator authorization / RBAC

Transport isolation remains ADR-022 §4.1 and
`packages/domain/src/channels/ARCHITECTURE.md`.

---

## 3. Connection and credential model

| Decision | Lock |
|----------|------|
| Aggregate | Existing `ChannelConnection` |
| Provider | Immutable `"ical"` |
| Feed URL storage | Standard encrypted credential vault material |
| Feed URL on connection columns | **Forbidden** |
| Job payloads | Trusted identifiers only (`tenantId`, `connectionId`, job metadata) — **never** feed URLs or secrets |
| Resolution | Only inside approved poll orchestration (`ReceiveChannelPollBatchUseCase` + resolver) |

### MVP credential material (conceptual)

```text
{
  feedUrl: string
}
```

### Future-extensible (not implemented in P1-S0)

```text
authHeader?, basicUser?, basicPass?, feedId?
```

Default poll auth policy when polling is registered:
`pollAuthPolicy.requiresCredentialRef: true`
(`withDefaultProviderRegistrationPolicies` in
`ChannelProviderRegistration.ts`).

Vault / resolver:
`IChannelCredentialStore`, `IChannelCredentialResolver`,
`PrismaChannelCredentialVault`.

---

## 4. Capability truth table (MVP)

Do **not** conflate polling evidence, reservation-import mapping, process
authorization, Booking emission, or inventory application.

### Transport and ingestion (behavior)

| Capability / behavior | Provider-1 MVP |
|-----------------------|----------------|
| Polling port (`IChannelPollingProvider`) | **true** — emits `ChannelProviderMessage[]` |
| Webhook port | **false** |
| Poll messages enter Inbox via `ReceiveChannelPollBatchUseCase` → Receive | **true** |
| Replay through platform | **true** (existing replay UCs / HTTP) |

Poll → Inbox is **inbound evidence ingestion**. It does **not** use
`IChannelReservationImportProvider`.

### Provider registration capabilities (exact repository fields)

| Capability field | Provider-1 MVP | Port |
|------------------|----------------|------|
| `inbound.polling` | **true** | non-null `polling` |
| `inbound.webhooks` | **false** | `null` |
| `inbound.reservationImport` | **false** | `null` — **not** required for Inbox evidence |
| `core.availabilityExport` | **false** | `null` — outbound only; not inbound sync |
| `core.rateExport` | **false** | (with restriction: `rateRestrictionExport` null) |
| `core.restrictionExport` | **false** | |
| `optional.reservationExport` | **false** | `null` |
| `connectionAuth` | **false** | `null` |

### Authorization and emission

| Behavior | Provider-1 MVP |
|----------|----------------|
| Booking creation | **false** |
| Reservation emission | **false** |
| `mayEmitReservationCreate` | **false** |
| Inventory mutation in iCal adapter | **false** |
| Outbound iCal / availability export | **false** |

A future OTA provider may set `reservationImport: true` with a real import
mapper. **Provider-1 MVP does not.**

### Existing preset conflict (reconcile in P1-S1 — do not fix in P1-S0)

`ICAL_PROVIDER_CAPABILITIES` in
`packages/domain/src/channels/types/ChannelCapabilities.ts` currently sets:

```text
core.availabilityExport: true
inbound.reservationImport: true
```

`validateChannelProviderRegistration` enforces capability ↔ port pairing
(enabled ⇒ non-null port; disabled ⇒ null).

P1-S1 must register MVP truth values above (`availabilityExport: false`,
`reservationImport: false`, ports null) and correct the shared preset / registry
tests accordingly. No parallel capability system. No outbound or reservation-import
adapter in Provider-1 MVP.
---

## 5. Semantic model (evidence-first)

Existing modes only (`FeedSemanticMode.ts`):

| Mode | Meaning for iCal |
|------|------------------|
| `mixed_or_unknown_feed` | **Default / fail-closed** when allow-list undeclared |
| `availability_block_feed` | Operator trusts feed as busy/availability blocks |
| `reservation_feed` | Operator trusts stronger reservation-shaped identity |

Rules:

- Do **not** treat every VEVENT as a confirmed Booking.
- Busy intervals are **evidence of availability blocking**.
- Ambiguous / unsupported events use taxonomy-backed `reservation.unknown`.
- No event may silently disappear (contract / conformance expectation).
- Removed UID ≠ proven guest cancellation; may only authorize **future owned
  block release**, never Booking cancel.
- `reservation.create|modify|cancel` kinds, if emitted, remain **evidence only**
  while emission is disabled.
- Semantic mode does **not** authorize Booking creation, inventory bypass, or
  cursor ACK shortcuts (`FeedSemanticMode.ts`, PROVIDER_AUTHOR_GUIDE).

Recommended `allowedFeedSemanticModes` for iCal (P1-S1 decision to confirm):
all three existing modes, with new connections defaulting to
`mixed_or_unknown_feed` until an operator promotes trust.

---

## 6. Event identity

| Rule | Lock |
|------|------|
| Stable id | `providerEventId = UID` |
| Recurrence instance (when supported) | `UID + RECURRENCE-ID` |
| UID meaning | Provider evidence — **not** internal Booking id |
| Duplicate UID | Deterministic handling + taxonomy `duplicate_uid` |
| Modify | Same external identity; interval/payload change |
| Replay | Persisted Inbox evidence only — **no live refetch** |
| Unsupported recurrence | Visible taxonomy outcome — **no silent incorrect expansion** |

---

## 7. Time semantics

Aligned with ADR-014 stay-period exclusivity where dates map to inventory nights.

| Topic | Lock |
|-------|------|
| All-day intervals | `[start, end)` |
| ICS all-day `DTEND` | Remains exclusive |
| TZID / aware timestamps | Normalize deterministically (codec in P1-S3) |
| Floating times | **Explicit policy required in P1-S3** — recommendation: interpret in **mapped property IANA timezone** when listing mapping exists; otherwise classify `malformed_time` / fail-closed (do not invent UTC silently) |
| Missing `DTEND` | Use valid `DURATION` if present; else malformed |
| Invalid / zero / negative ranges | Not accepted as normal busy intervals → taxonomy / fail |

Codec is **not** implemented in P1-S0.

---

## 8. Poll and cursor semantics

| Rule | Lock |
|------|------|
| Delivery | At-least-once |
| Retry safety | Same committed cursor must be safe to re-poll |
| Authority | Provider proposes; platform commits |
| Opacity | Platform never interprets cursor payload |
| Advance | Only when durable Receive outcomes allow ACK (`ackAllowed`) |
| Partial failure | **No** cursor advancement |
| Replay | **Never** mutates poll cursor |

### Conceptual opaque cursor fields (provider-owned encoding)

```text
etag?
lastModified?
contentHash?
snapshotVersion?
fetchedAt?
```

**`fetchedAt` is observational metadata only.** It must **not** participate in
semantic equality of “feed unchanged.” Unchanged validators + content/snapshot
hash must not appear changed solely because `fetchedAt` moved.

No database schema for these fields — they live inside the opaque cursor string.

---

## 9. HTTP caching

Supported:

- `ETag` / `If-None-Match`
- `Last-Modified` / `If-Modified-Since`
- `304 Not Modified`
- Content-hash fallback
- Normalized snapshot hash (`snapshotVersion`)

Rules:

- **304** → no semantic messages; may preserve/update validator metadata in proposed cursor.
- Unchanged content → no duplicate semantic messages.
- Weak/absent validators → require content hashing / snapshot hash.
- HTTP success alone does **not** authorize cursor advance before durable Receive ACK.

---

## 10. SSRF and fetch security (P1-S2 requirements)

Mandatory before any production fetch:

- HTTPS only in production
- No `file:`, `gopher:`, FTP, or arbitrary schemes
- Reject localhost, loopback, private ranges, link-local, cloud metadata endpoints
- Validate **every** redirect target (same rules); hop limit; no unrestricted auto-follow
- DNS resolution + rebinding considerations (resolve and re-check destination)
- Request timeout; hard response body limit
- No secret-bearing URL logging; no credential material in jobs, Inbox, metrics, or traces
- Invalid URL / blocked destination → **permanent until operator correction**

---

## 11. Failure taxonomy

### Retryable

- DNS / transient network failure
- Timeout / connection reset
- HTTP 429 / 5xx
- Temporary upstream failure

→ No cursor advance; platform job backoff.

### Permanent until operator correction

- HTTP 401 / 403 / 404 / 410
- Invalid URL / unsupported scheme
- Blocked SSRF destination
- Oversized feed
- Consistently malformed ICS (calendar unparseable)
- Invalid credential material (missing/empty `feedUrl`)

→ No cursor advance; surface via connection `error` / `lastError` when wiring exists
(`ChannelConnection.markError` exists; poll path does not yet call it — see open decisions).

### Evidence-level ignored / unknown (per event)

- Unsupported VEVENT feature / RRULE
- Duplicate UID
- Malformed event inside an otherwise usable feed
- Missing required event fields / invalid interval
- Ambiguous cancellation / removal (`cancellation_unproven`)

### MVP recommendation: whole-feed vs per-event

| Condition | Recommendation |
|-----------|----------------|
| Calendar bytes unparseable / not ICS | **Permanent** feed failure — no messages, no cursor advance |
| Calendar parses; some VEVENTs bad | Emit taxonomy unknowns for bad events; process valid ones; cursor may advance only if batch ACK rules pass |

Do not implement in P1-S0; P1-S4/S5 must codify against `ChannelIngressBatchProcessor` ACK rules (all submitted messages must succeed for `ackAllowed`).

---

## 12. Inventory Applicator boundary (lock now; implement P1-S6)

Allowed path only:

```text
Inbox evidence → Process → separate Inventory Applicator
  → Commerce application/domain port → inventory persistence
```

Forbidden:

```text
ICalPollingProvider → UnitCalendarBlock
```

Separate component — **not** inside the iCal provider.

| Must | Must not |
|------|----------|
| Consume classified Inbox evidence only | Fetch ICS or parse in applicator |
| Use Commerce application/domain ports only | Bypass Commerce or write SQL from Channels adapter |
| Persist inventory calendar-block state via Commerce | Create Booking aggregates / enable emission |
| Ownership-safe apply/modify/release | Release another source’s block |
| Stable idempotency: tenant, connection, mapped unit, external event id | Silent skip of ownership violations |
| Durable conflict outcomes; replay-safe | Claim EXCLUDE for types not covered today |

### Idempotency expectations

| Scenario | Expectation |
|----------|-------------|
| Apply block | Same tenant+connection+external event+unit → same logical block (upsert) |
| Modify interval | Update owned block stay period idempotently |
| Remove/release | Release only owned active block; repeated release is no-op success |
| Duplicate event / re-poll | No second active owned block |
| Replay | Safe re-apply from new inbox row; no double inventory |
| Same snapshot repeatedly | No churn |

### Current Commerce / EXCLUDE surface (inspected)

- Port: `ICalendarBlockRepository`
  (`saveOperatorBlock`, `releaseBlock`, reads) — operator-oriented; **not**
  ownership-safe for channel sync as-is.
- Schema: `sourceId` optional **UUID**; types
  `manual | maintenance | cleaning | owner | hold | booking | turnover`.
- **No** channel connection id / external event id ownership columns today.
- **EXCLUDE (ADR-010 / migration):** active rows with
  `block_type IN ('hold', 'booking')` only. Operator-style types are **outside**
  that predicate today.

P1-S6 must use database-enforced concurrency **where** its chosen block
representation is covered by an approved constraint; current EXCLUDE coverage is
limited to hold/booking and **may require a migration** to support channel-owned
inventory safely. P1-S0 does **not** lock block type, columns, indexes, or
constraint shape.

#### Bounded P1-S6 decision (deferred — choose before coding)

**Option A — Extend database exclusion coverage (preferred direction):**  
channel-owned block representation; extend EXCLUDE (or equivalent) to cover it;
ownership metadata; repository/application ops; **migration**.

**Option B — Keep imported blocks outside EXCLUDE:**  
application-level conflict checks; explicit weaker DB serialization; documented
races; strong justification before production.

P1-S0 locks only: safe ownership, idempotency, conflict handling, release rules,
Commerce-port boundary. Final schema design = P1-S6 architecture + review.
ADR-022 still forbids writing blocks from transport/provider code.

### Current process behavior before P1-S6 (runtime today)

- `ProcessChannelInboxItemUseCase` runs the existing **reservation.create**
  processing path only where applicable.
- Provider-1 evidence introduced by **P1-S5** may be **durably received and
  stored** but will **not** mutate inventory until **P1-S6** exists.
- Non-supported message kinds may currently result in an **unsupported /
  recorded** process outcome.
- This is **expected** — not a failed Provider-1 architecture.
- **P1-S5** proves durable ingestion; **P1-S6** delivers inventory business
  semantics. Do not claim current process already applies inventory.
---

## 13. First-property readiness (P1-S9 gate)

Do **not** begin P1-S9 until all are complete and approved:

```text
P1-S1 registration
P1-S2 SSRF-safe fetch
P1-S3 parser
P1-S4 mapper/cursor
P1-S5 poll → Inbox
P1-S6 Inventory Applicator
P1-S7 operator configuration
P1-S8 scheduled polling
```

### Pilot success definition

```text
Remote ICS
→ safe poll
→ durable Inbox evidence
→ deterministic processing
→ owned UnitCalendarBlock apply/update/release
→ no Booking creation
```

Pilot shape: one tenant, one property, one unit, one iCal feed; rollback by
disabling schedule / provider enablement flags.

---

## 14. Approved roadmap and slice contracts

```text
P1-S0  Architecture / ADR lock-in     ← this document
P1-S1  Registration skeleton
P1-S2  SSRF-safe HTTP fetch + limits
P1-S3  ICS parser + normalizer
P1-S4  Mapper → ChannelProviderMessage + opaque cursor
P1-S5  Poll → Inbox
P1-S6  Inventory Applicator
P1-S7  Operator connection UX
P1-S8  Scheduled polling
P1-S9  First production property pilot
```

### Exit criteria

| Slice | Exit |
|-------|------|
| **P1-S0** | Decisions recorded; ambiguities listed; **no runtime change** |
| **P1-S1** | Factory + **fail-closed** polling skeleton; capabilities =
  MVP table (`reservationImport`/`availabilityExport` false); no live HTTP/parser;
  registry/DI tests; flags off; **no synthetic cursor advance** |
| **P1-S2** | Secure fetch boundary; controlled tests; no ICS semantics |
| **P1-S3** | Bytes → normalized snapshot; fixtures; no Inbox/Commerce |
| **P1-S4** | Diff + taxonomy + messages + cursor codec; provider contract tests; no live platform writes |
| **P1-S5** | Vault poll → durable Receive → cursor CAS; PG proof; no Booking; **no inventory mutation**; process may record unsupported for non-create |
| **P1-S6** | Inbox → Commerce inventory; ownership + EXCLUDE strategy decided; idempotency; replay safety; no Booking |
| **P1-S7** | Encrypted feed URL config; activate; manual/test poll; no secret leaks |
| **P1-S8** | Provider-neutral scheduler; jitter/backoff; safe rollback |
| **P1-S9** | Real property pilot; monitoring/runbook; no Booking creation |

### P1-S1 fail-closed skeleton (safety lock)

The registration skeleton must **fail closed**.

- It must **not** return an empty successful poll with a synthetic non-null
  `nextCursor`.
- In current orchestration, an empty batch with a non-null proposed cursor can
  **legitimately advance** the cursor (`ChannelIngressBatchProcessor` /
  `ExecuteChannelPollConnectionUseCase`).
- Until real fetching and cursor semantics exist, the skeleton must either:

  - throw a deliberate not-implemented / fail-closed provider error; or
  - return **no** proposed cursor and no false connectivity success.

Final code shape is chosen in P1-S1; this safety requirement is locked here.
---

## 15. Open questions — repository answers

### 1. Exact semantic mode names?

`mixed_or_unknown_feed`, `availability_block_feed`, `reservation_feed`  
(`packages/domain/src/channels/types/FeedSemanticMode.ts`).

### 2. Exact capability fields and port-pairing?

`ChannelProviderCapabilities` + `validateChannelProviderRegistration` /
`assertCapabilityMatch` for: `connectionAuth`, `webhooks`, `polling`,
`reservationImport`, `availabilityExport`, `rateRestrictionExport`,
`reservationExport`; plus auth-policy presence rules when webhooks/polling enabled
(`ChannelProviderRegistry.ts`).

### 3. Does `ICAL_PROVIDER_CAPABILITIES` conflict with MVP?

**Yes.** Preset today sets `core.availabilityExport: true` and
`inbound.reservationImport: true`. MVP requires both **false** with null ports.
**P1-S1** reconciles preset + registry tests. Poll→Inbox does **not** need
`reservationImport`.
### 4. Where should Provider-1 architecture authority live?

- **ADR-023** (decision summary)  
- **This lock-in doc** (normative detail)  
- Pointer from `packages/domain/src/channels/ARCHITECTURE.md`  
Subordinate to ADR-022.

### 5. New ADR or note only?

**Both:** ADR-023 + this architecture note (repository convention matches other
CM-4b slice docs under `docs/`).

### 6. Existing taxonomy values?

From `UNKNOWN_CATEGORIES_V1` (`UnknownTaxonomy.ts`):

| Need | Category |
|------|----------|
| Availability block | `inventory_block` (also `owner_block` / `maintenance_block` when distinguishable) |
| Removed UID / unproven cancel | `cancellation_unproven` |
| Duplicate UID | `duplicate_uid` |
| Malformed interval / time | `malformed_time` |
| Unsupported recurrence | `recurring_master`, `recurrence_instance_unsupported`, `unsupported_vevent_feature` |

Also: `ambiguous_reservation`, `malformed_identity`, `parser_limitation`,
`provider_limitation`, `other_unclassified`.

### 7. Taxonomy extension required later?

**Not for MVP** — v1 categories suffice. Additive reason codes allowed without
version bump; category renames require new taxonomy version (policy in
`UnknownTaxonomy.ts`). Defer iCal-specific reason-code polish to mapper slice.

### 8. Exact Commerce port for P1-S6?

Today: `ICalendarBlockRepository` + operator use cases — insufficient for
ownership-safe channel release. P1-S6 defines Commerce application API still
committing through calendar-block persistence — **open design in P1-S6**.

### 9. Does inventory model support source ownership for safe release?

**No (today).** No `(connectionId, providerEventId)` ownership metadata.
**P1-S6 + likely migration.**

### 10. Will P1-S6 require a migration later?

**Very likely yes** (ownership metadata and/or block type and/or EXCLUDE
predicate extension). **P1-S0 requires none.** Exact schema deferred to P1-S6
review (Option A vs B in §12).

### 10b. Exact current EXCLUDE coverage?

Active `unit_calendar_blocks` with `block_type IN ('hold', 'booking')` only
(ADR-010 / commerce migration). Not all inventory block types.
### 11. Connection lifecycle after successful first poll?

Connection should already be **`active`** (activation is S3e / operator path
before poll eligibility). Successful poll does **not** invent a new status.
Keep **`active`**; clear transient errors only if a future poll-success path
explicitly clears `lastError` (not wired today).

### 12. How are permanent poll failures surfaced today?

- Aggregate supports `ChannelConnection.markError(message)` → status `error` +
  `lastError` (max 500 chars).
- Operator read model exposes `lastError`.
- **`ExecuteChannelPollConnectionUseCase` / poll job do not currently call
  `markError`** (inspected — no matches in poll execute path).

→ Wiring permanent failure → `markError` is an **open decision for P1-S5/S7**
(must avoid leaking URLs/secrets into `lastError`).

### 13. Feature flags (existing + future)

**Existing (`.env.example` / web lib):**

| Flag | Role |
|------|------|
| `CHANNELS_ENABLED_PROVIDERS` | Include `ical` when factory exists |
| `CHANNELS_POLLING_ENABLED` | Gate poll job handler + admin poll |
| `CHANNELS_OPERATOR_API_ENABLED` | Operator HTTP |
| `CHANNELS_INBOX_REPLAY_API_ENABLED` | Replay HTTP |
| `CHANNELS_WEBHOOK_API_ENABLED` | N/A for iCal |
| `CHANNELS_SEMANTIC_MODE_API_ENABLED` | Semantic mode HTTP |
| `CHANNELS_CREDENTIALS_MASTER_KEY` | Vault |

**Not existing yet (assign to later slices):**

| Concern | Open flag name (proposal only) |
|---------|--------------------------------|
| Inventory apply | e.g. `CHANNELS_INVENTORY_APPLY_ENABLED` — **P1-S6** |
| Automatic schedule | e.g. `CHANNELS_POLL_SCHEDULE_ENABLED` — **P1-S8** |

Do not add flags in P1-S0.

### 14. Naming implying iCal outbound export?

Yes: preset `availabilityExport: true` means outbound. Also preset
`reservationImport: true` must not be read as “Inbox evidence.” Both corrected
in MVP table; fix constants in P1-S1.
### 15. Docs to update when P1-S1 lands?

- This lock-in doc (status / registration notes)
- `packages/domain/src/channels/ARCHITECTURE.md` (Provider-1 implementation note)
- `docs/cm-4b-s4a2a-transport-di-wiring.md` (factories no longer empty for iCal)
- `.env.example` (comment that `ical` may be listed under `CHANNELS_ENABLED_PROVIDERS`)
- Possibly `PROVIDER_AUTHOR_GUIDE.md` (iCal polling-only example)
- ADR-023 remains stable unless decision changes

---

## Open decisions assigned after correction

### P1-S1

- Correct `ICAL_PROVIDER_CAPABILITIES` to MVP truth table
- Reconcile registry tests
- Register **polling only** (`reservationImport: false`, `availabilityExport: false`)
- Fail-closed skeleton; no cursor advancement from placeholder behavior

### P1-S4 / P1-S5

- Precise empty-batch / 304 cursor behavior
- Snapshot diff; whole-batch ACK; malformed-event handling
- Durable Inbox proof; process may record unsupported until S6

### P1-S6

- Inventory ownership model; block source representation
- Commerce application API; repository operations
- Idempotent upsert/release; interval modification
- Exact EXCLUDE strategy (Option A vs B); likely migration; conflict outcomes

---

## 16. Risk register

| Risk | Owner slice | Prevention | Detection | Rollback / recovery |
|------|-------------|------------|-----------|---------------------|
| SSRF | P1-S2 | Allow-list schemes/hosts; block private/metadata; validate redirects | Unit matrix; deny logs (no URL secrets) | Disable provider / polling flags |
| Redirect / DNS rebinding | P1-S2 | Re-validate each hop; resolve+check | Tests with malicious redirects | Same |
| Feed URL leakage | P1-S1+ | Vault only; never log material; sanitize `lastError` | Fitness / log reviews | Rotate URL; scrub logs |
| Huge feed memory | P1-S2/S3 | Hard body + parse budgets | Size rejection metrics | Permanent error until smaller feed |
| Malformed calendars | P1-S3/S4 | Fail-closed parse; taxonomy per event | Fixture suite | No cursor advance on hard fail |
| Recurrence complexity | P1-S3/S4 | Unknown taxonomy; no silent expand | Contract tests | Operator mode stays mixed |
| Timezone ambiguity | P1-S3 | Explicit floating policy; ADR-014 | Golden fixtures | Classify malformed_time |
| UID instability | P1-S4/S6 | Stable id rules; avoid false release | Snapshot diff tests | Manual reconcile; no auto Booking cancel |
| False release from missing events | P1-S4/S6 | Release only on proven snapshot absence + ownership | Idempotent release tests | Disable apply flag; restore blocks manually |
| Stale snapshot / cursor bugs | P1-S4/S5 | Opaque cursor + ACK-gated CAS; content hash | Re-poll / 304 tests | Clear cursor via semantic transition tooling |
| Duplicate block application | P1-S6 | Ownership upsert key | PG unique + tests | Release duplicates; fix key |
| Ownership-safe release | P1-S6 | Schema/port ownership | Cross-source tests | Never release non-owned |
| EXCLUDE conflicts | P1-S6 | Durable process failure | Integration tests | Operator resolves overlap |
| Schedule thundering herd | P1-S8 | Jitter; per-tenant limits | Queue depth | Disable schedule flag |
| Upstream polling limits | P1-S5/S8 | Backoff on 429 | Job retries | Increase interval |
| Evidence treated as Booking | All | Emission false; process gates | Fitness forbids CreateBooking in provider | Keep `mayEmitReservationCreate` false |
| Accidental outbound capability | P1-S1 | `availabilityExport: false` | Registry validation | Unregister factory |
| Accidental reservationImport pairing | P1-S1 | `reservationImport: false` | Registry validation | Unregister / fix preset |
| Pilot rollback | P1-S9 | Flags off; pause connection | Runbook | Disable schedule + providers list |
| Assuming EXCLUDE covers all block types | P1-S6 | Document ADR-010 predicate; Option A/B | Schema review | Do not ship Option B without justification |

---

## 17. ADR impact

| Document | Action |
|----------|--------|
| ADR-022 | **Unchanged** (no contradiction) |
| ADR-009 / 010 / 014 | Referenced; EXCLUDE scope per ADR-010 |
| **ADR-023** | Provider-1 decision + rejected alternatives + MVP caps |
| This note | Normative lock-in (corrective: F1–F4) |
| `ARCHITECTURE.md` | Pointer + MVP polling-only / EXCLUDE caveat |

---

## 18. P1-S0 validation (including corrective pass)

- Inspected capability pairing, EXCLUDE predicate, process create-only path
- Documentation corrections only (no runtime)
- **No** production runtime code / migrations / factory registration / feature flags
  in the P1-S0 pass itself
- P1-S0 left factories as `Object.freeze({})`; **P1-S1** adds the iCal constructor
  (still empty live registry unless allow-listed)
- Git unavailable in workspace — no `git diff --stat`
