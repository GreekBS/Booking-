# Booking.com Certification Readiness

**Status:** CODE COMPLETE · CERTIFICATION READY · EXTERNALLY BLOCKED  
**Provider:** `booking_com`  
**Approved foundation:** CM-4c-1 → CM-4c-5  
**This document:** CM-4c certification / red-team hardening pack (pre-freeze)  
**Does NOT claim:** Booking.com Connectivity certification, PCI certification, or live E2E success

---

## 1. Implemented capabilities

| Area | V1 support |
|------|------------|
| Machine-account auth contracts | Yes (JWT exchange contracts; live client NotConfigured in Production) |
| Reservation retrieve (new / modify / cancel) | Yes (adapter + fixtures; live NotConfigured) |
| Durable Receive → Inbox → Job → normalize → Commerce | Yes |
| ACK after durable Receive | Yes |
| Outbound ARI: roomstosell, open/close, Standard prices, min/max stay, CTA, CTD | Yes |
| Month slicing / coalesce / newest-wins | Yes |
| ≥12-month horizon batching | Yes (month keys + durable per-month jobs) |
| Product mapping (property / room / rate / roomrate) | Yes |
| Mapping validation (blocking + warnings) | Yes |
| Initial-sync preview + stale-safe confirm | Yes |
| Reconciliation (mappings / reservations / ARI) | Yes (reservation recovery via Receive only) |
| Origin-aware outbound loop suppression | Yes (generic channel helper) |
| Tenant operator UI + wizard + Help Center | Yes (CM-4c-5) |
| Production enablement | **No** |

---

## 2. Architecture summary

ADR-022 (inventory consistency) remains authoritative. Channels never write calendars or Bookings directly.

```
Inbound:
  Booking.com retrieve → parse/redact → ReceiveChannelEventUseCase
  → immutable Inbox → Background Job → provider normalize
  → Commerce create/modify/cancel → PostgreSQL inventory authority
  → Booking + Outbox → downstream / outbound ARI (origin-aware)

Outbound:
  Talos authoritative mutation → Outbox → ARI projection
  → ledger coalesce → worker ExecuteBookingComAriPushUseCase
  → Booking.com ARI adapter → result ledger → retry / reconcile

Setup:
  connection → mappings → validate → remote read → preview
  → stale-safe confirm → durable ARI enqueue → activate → reconcile
```

Transport/provider code cannot bypass `ReceiveChannelEventUseCase` for reservations.
ARI push cannot be invoked synchronously from Commerce; it is durable outbox/job only.

---

## 3. Reservation flow guarantees

- Deduplication key per ingress identity → duplicate create/modify/cancel safe after Receive.
- Modify/cancel before create fail closed (no invented Booking).
- Stale revision → already_applied / no double apply.
- ACK is outside application success: Receive durable first; provider retry after ACK failure re-enters Receive (dedup).
- Summary recovery (`BookingComSummaryRecoveryUseCase`) always calls Receive — never direct Booking writes.
- Payment/VCC XML fragments are redacted before inbox persistence (defensive V1 boundary; **PCI not claimed**).

---

## 4. ARI flow guarantees

- Delta projection for availability / Standard rates / restrictions.
- `enumerateMonthKeys` + per-month coalesce keys; ≥12 months supported.
- Ledger highest-generation coalesce; stale generations suppressed.
- Retryable: transport errors, 429, 5xx, `pending_auth`, **paused**.
- Permanent: disconnected / non-active terminal states, permanent provider errors.
- Pause while queued: push deferred (retryable) so work survives resume.
- Disconnect while queued: permanent fail (no silent push after disconnect).
- Loop suppression: same-provider inbound origin does not echo ARI back.

---

## 5. Mapping model

- Talos Unit ↔ Booking.com room type  
- Talos RatePlan ↔ Booking.com rate plan / roomrate (Standard pricing only)  
- Duplicate remote room / roomrate → blocking validation  
- Stale mapping generation → reject ARI / confirm  
- Mapping drift never auto-heals reservations into Bookings

---

## 6. 12-month horizon

Talos can project and schedule ≥12 months of ARI by slicing into month-scoped coalesce keys and outbox events. Memory stays proportional to segments × months (not a single monolithic XML). Evidence: `BookingComCertificationRedTeam.cm4c6prep.test.ts`.

---

## 7. Retry / recovery / idempotency

| Concern | Mechanism |
|---------|-----------|
| Provider retry | Inbox dedup + ACK-after-Receive |
| Worker crash | Durable inbox/job/outbox + resume |
| ARI outage | Retryable push + job backoff |
| Missed reservation | Summary recovery → Receive |
| Dead-letter | Job max attempts; operator redrive / reconcile |
| Initial sync stale | Fingerprint + mapping generation CAS |

---

## 8. Security boundary

Never log or return to browsers: `client_secret`, machine JWT, sealed credential material, Authorization headers.  
ARI observability emits structured non-secret fields only.  
Tenant APIs derive tenant from authenticated actor context.

---

## 9. PII / PCI status

| Item | V1 status |
|------|-----------|
| Guest given/surname in structured fields | Parsed for operations |
| Raw reservation XML in inbox | Stored **after** payment/VCC redaction |
| Card / VCC display or vault | **Not implemented** |
| PCI DSS certification | **NOT CLAIMED** |
| Remaining compliance | External: retention policy, access controls, DPA, live payload review with real Extranet samples |

---

## 10. Observability

Operators can diagnose via connection health surfaces + structured events:

- reservation retrieval / ACK / processing failures  
- mapping / inventory conflict / ARI push / stale suppress  
- reconciliation drift / provider unavailable  

No secrets/PAN in telemetry fields.

---

## 11. Known limitations

- Booking.com Connectivity Partner / listing access externally blocked  
- Live HTTP clients NotConfigured in Production  
- Standard pricing only (OBP/LOS/Derived rejected)  
- Continuous Commerce/inventory → `RequestBookingComAriPropagation` fan-out is not yet wired from every Talos mutation path (initial-sync confirm + reconcile heal paths exist; live mutation bridge is remaining engineering before continuous ARI after every booking)  
- `inboundOriginProvider` must be set by callers of ARI schedule for loop suppression to engage in production mutation flows  
- Initial-sync local cells remain placeholder/conservative until live inventory projection is connected  
- Real PostgreSQL inventory concurrency under Booking.com load: requires `TEST_DATABASE_URL`  
- Official certification scripts / RUID evidence pack: require live test hotel  

---

## 11b. Follow-up hardening (post CM-4c-5 audit)

Fixed without live credentials:

- Pause-while-queued ARI is retryable  
- Confirm fails closed when enqueue rejects all projections  
- Payment/VCC XML redaction before inbox persistence  
- Local ARI cell horizon supports ≥12 months (max 400 days, fail-closed — no silent 62-day truncate)  
- Confirm binds `from`/`to` to previewed horizon  
- Modify/cancel-before-create inbox outcomes retry instead of dead-letter  
- Summary recovery use case wired in DI (client remains NotConfigured until live HTTP)  

## 12. Tests / evidence

- `packages/domain/tests/channels/booking_com/BookingComProviderFoundation.cm4c1.test.ts`  
- `…/BookingComReservationIngestion.cm4c2.test.ts`  
- `…/BookingComOutboundAri.cm4c3.test.ts`  
- `…/BookingComMappingSync.cm4c4.test.ts`  
- `…/BookingComCertificationRedTeam.cm4c6prep.test.ts`  
- Architecture fitness: `BookingComMappingSyncFitness.cm4c4.test.ts`, `BookingComCertificationFitness.cm4c6prep.test.ts`, `ChannelArchitectureFitness.test.ts`  
- Tenant UI: `apps/web/tests/channels/booking-com-tenant-ui.cm4c5.test.ts`

---

## 13. REAL_ACCESS_REQUIRED

1. Machine-account authentication against Booking.com token endpoint  
2. Test hotel / property binding in Extranet  
3. Live remote discovery + room/rate catalog  
4. Live initial ARI upload + RUID collection  
5. Live test booking → retrieve → ACK → Talos Booking  
6. Live modify / cancel / summary recovery against provider  
7. Provider outage behavior with real rate limits / Retry-After  
8. Certification evidence pack submission to Booking.com  

---

## 14. CM-4c-6 real E2E checklist (documentation only — do not execute now)

1. Machine-account authentication  
2. Property / test-hotel access  
3. Remote discovery  
4. Mapping (property / rooms / rates)  
5. Initial ARI upload (≥12 months Standard)  
6. Booking.com test booking  
7. Reservation retrieval  
8. ACK  
9. Talos Booking creation  
10. Inventory verification (ADR-022 / PostgreSQL)  
11. Outbound ARI verification  
12. Modification  
13. Cancellation  
14. Reconciliation  
15. Provider outage / retry  
16. RUID collection  
17. Certification evidence  

---

## 15. External partner-access blocker

New Connectivity Provider onboarding / Extranet Channel Manager listing for Talos is unavailable.  
Until Booking.com grants partner/test access, live E2E and certification **cannot** proceed.

**Engineering freeze recommendation:** freeze `booking_com` feature work; move to the next provider; reopen only for CM-4c-6 when official test access exists.
