# ADR-023: Provider-1 (iCal) — Polling-Only Inbound Evidence Adapter

## Status

Accepted

## Context

CM-4b S4a (operator foundation, transport DI, webhook/admin HTTP) is closed. The
platform can receive provider-neutral poll batches into Channel Inbox, but no
production provider is registered.

The first production property needs an iCal feed adapter to validate the Channel
platform end-to-end (poll → Inbox → process → inventory sync) before OTA APIs
(Booking.com, Airbnb, Vrbo, Expedia).

Without a narrow architectural lock-in, later slices risk:

- writing inventory from the HTTP/parser adapter;
- storing feed URLs on `ChannelConnection`;
- treating VEVENTs as Booking reservations;
- advertising outbound `availabilityExport` without an adapter;
- conflating poll→Inbox evidence with `IChannelReservationImportProvider`;
- assuming every inventory block type is covered by today’s EXCLUDE predicate;
- bypassing Inbox, Commerce ports, or ADR-022 transport isolation.

## Decision

Provider-1 (`provider = "ical"`) is a **polling-only inbound evidence adapter**.

It:

1. Interprets vault credential material containing an iCal `feedUrl`.
2. Fetches ICS bytes under SSRF-safe HTTP rules (including redirects).
3. Parses and normalizes VEVENTs into a snapshot.
4. Diffs snapshots and maps changes to `ChannelProviderMessage` values.
5. Proposes an **opaque** poll cursor; the platform commits via existing CAS.
6. Enters the platform only through approved poll orchestration →
   `ReceiveChannelEventUseCase` → Channel Inbox.

It does **not**:

- implement webhooks, OTA APIs, pricing, restrictions, guest messaging, or payments;
- export availability/rates/restrictions outbound;
- register `inbound.reservationImport` or an `IChannelReservationImportProvider` in MVP;
- create Booking aggregates or enable `mayEmitReservationCreate`;
- write `UnitCalendarBlock` rows from the adapter;
- persist cursors, mutate connection lifecycle, or schedule global polls;
- special-case Inbox, replay, or semantic governance for iCal.

**Capability intent (MVP registration):** `polling: true`; all of `webhooks`,
`reservationImport`, `availabilityExport`, `rateExport`, `restrictionExport`,
`reservationExport`, and `connectionAuth` are **false** (ports null). Poll
messages still enter Inbox via existing poll batch orchestration — that path does
**not** require the reservation-import port.

Inventory synchronization (apply/update/release of owned calendar blocks) is a
**separate Inventory Applicator** (P1-S6):

```text
Inbox evidence → Process → Inventory Applicator → Commerce port → persistence
```

never:

```text
ICalPollingProvider → UnitCalendarBlock
```

**Concurrency:** ADR-010’s PostgreSQL EXCLUDE currently covers only active
`hold` / `booking` blocks. P1-S6 must not claim EXCLUDE protection unless its
chosen persisted representation is covered by an approved constraint; extending
coverage likely needs a migration and is deferred to P1-S6 design review.

Credential storage uses the standard encrypted vault. The feed URL is never
stored on `ChannelConnection` columns. Job payloads carry trusted identifiers
only.

Authoritative detail, slice contracts, failure taxonomy, and open decisions live
in:

`docs/cm-4b-p1-s0-ical-architecture-lock-in.md`

## Rejected alternatives

### Store `feedUrl` on `ChannelConnection`

Bypasses credential abstraction; leaks secret-like URLs into connection state;
creates a provider-specific storage path; weakens future OTA compatibility.

### iCal adapter writes inventory directly

Bypasses Receive and Inbox; breaks replay and evidence immutability; couples
parsing to Commerce persistence; violates ADR-022 transport isolation.

### Model every VEVENT as a Booking reservation

iCal meaning is ambiguous; guest/reservation identity is weak; removed events do
not prove Booking cancellation; Booking emission remains disabled.

### Advertise outbound availability in MVP

Provider-1 is inbound-only; no outbound port exists; capability/port pairing must
remain truthful (`availabilityExport: false`).

### Treat poll→Inbox as `reservationImport: true`

`inbound.reservationImport` pairs with `IChannelReservationImportProvider`
(import mapping). Inbox evidence from polling does not require that port. MVP
keeps `reservationImport: false`.

## Consequences

- P1-S1 must register polling-only capabilities under
  `validateChannelProviderRegistration`: `reservationImport: false`,
  `availabilityExport: false`, corresponding ports `null`; reconcile
  `ICAL_PROVIDER_CAPABILITIES` (today incorrectly sets `availabilityExport: true`
  and `reservationImport: true`) and related registry tests; skeleton must be
  fail-closed (no synthetic cursor advance).
- P1-S5 proves durable ingestion; current process may record unsupported outcomes
  for non-create kinds until P1-S6.
- P1-S6 owns ownership model, Commerce API, EXCLUDE strategy, and likely migration.
- ADR-022 is unchanged and remains constitutional for inventory and Booking paths.
- Fingerprint remains `cm4b-s3d-fingerprint-v1`. Emission remains disabled.

## References

- ADR-022 Inventory Consistency & Double Booking Guarantees
- ADR-009 Unit Calendar Block Model
- ADR-010 Double Booking Prevention
- ADR-014 Dates, Timezones, and Stay Periods
- `packages/domain/src/channels/ARCHITECTURE.md`
- CM-4b S4a-1 / S4a-2a / S4a-2b transport docs
