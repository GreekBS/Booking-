# CM-4b — Inbound iCal Production Pilot Runbook

Status: **inbound production-ready (flag-gated)**. Outbound ICS is out of scope.
Booking emission remains hard-off (`mayEmitReservationCreate === false`).

Authority: ADR-022, ADR-023, `packages/domain/src/channels/ARCHITECTURE.md`.

---

## Architecture (inbound)

```text
External ICS URL (vault feedUrl)
→ IcalPollingProvider (SSRF-safe fetch → parse → map)
→ ReceiveChannelPollBatchUseCase
→ ReceiveChannelEventUseCase
→ immutable Channel Inbox (reservation.unknown evidence only)
→ process_channel_inbox → UNSUPPORTED (no Booking)

Parallel when inventory apply is ON:
successful poll → TX1 cursor + generation + outbox
→ reconcile_ical_imported_inventory
→ UnitCalendarBlock(channel_import)
→ AvailabilityEvaluator treats active channel_import as BLOCKED
```

iCal never emits `reservation.create` and never writes Booking rows.

---

## Enable (Production configuration)

Do **not** enable these automatically. Set intentionally per environment.

| Variable | Required value for live iCal | Default (safe) |
|---|---|---|
| `CHANNELS_ENABLED_PROVIDERS` | `ical` (comma-list; no test providers) | empty |
| `CHANNELS_POLLING_ENABLED` | `true` | `false` |
| `CHANNELS_INVENTORY_APPLY_ENABLED` | `true` (global gate) | `false` |
| `CHANNELS_OPERATOR_API_ENABLED` | `true` (operator setup) | `false` |
| `CHANNELS_CREDENTIALS_MASTER_KEY` | valid 32-byte base64 key | empty (fail-closed) |
| `CHANNELS_ICAL_POLL_INTERVAL_MS` | optional; default 900000 (15m), min 300000 | unset |
| `BACKGROUND_JOBS_SECRET` | shared Bearer for internal jobs | required |
| `OUTBOX_DISPATCH_SECRET` | shared Bearer for outbox dispatch | required |

Per connection (DB):

- `provider = ical`
- `semanticMode = availability_block_feed`
- `status = active`
- exactly one active listing mapping (unit)
- sealed vault credential with `feedUrl`
- `inventory_apply_enabled = true` via operator enable endpoint

### Cron / workers (external)

Suggested cadence (operators own the scheduler — not auto-configured by app):

| Cadence | Endpoint | Auth |
|---|---|---|
| ~1m | `POST /api/internal/v1/outbox/dispatch` | `Bearer ${OUTBOX_DISPATCH_SECRET}` |
| ~1m | `POST /api/internal/v1/jobs/run` | `Bearer ${BACKGROUND_JOBS_SECRET}` |
| ~15m | `POST /api/internal/v1/channels/schedule-ical-polls` | `Bearer ${BACKGROUND_JOBS_SECRET}` |

Fail-closed: if polling / providers / apply are off, schedule/poll/apply no-op or refuse.

---

## Pilot (one connection)

1. Keep global flags off until the connection is configured.
2. Create iCal connection; put feed URL via credential vault (never store URL on connection columns).
3. Upsert one listing mapping → unit.
4. Set semantic mode `availability_block_feed`.
5. Activate connection.
6. Enable Production flags above.
7. Enable connection inventory apply:
   `POST /api/admin/v1/channel-connections/{id}/inventory-apply/enable`
8. Either wait for schedule or enqueue manual poll:
   `POST /api/admin/v1/channel-connections/{id}/poll`
9. Confirm health:
   `GET /api/admin/v1/channel-connections/{id}/health`

---

## Verify

Confirm all of:

1. Poll job logs `channels.poll_channel_connection` with `ackAllowed` / cursor fields (no feed URL).
2. Inbox contains `reservation.unknown` evidence only (no `reservation.create`).
3. Reconcile logs `channels.ical_inventory_reconcile` with created/updated/deactivated counts.
4. Active `unit_calendar_blocks` with `block_type = channel_import` for the mapped unit.
5. Availability check for overlapping stay returns unavailable (`BLOCKED`).
6. **Zero** new Booking rows attributable to iCal.

Repeated identical feed: idempotent (no duplicate evidence / no cursor thrash).
Fetch or malformed ICS failure: no cursor advance, no inventory release.

---

## Rollback

Immediate stop:

1. Set `CHANNELS_POLLING_ENABLED=false` (schedule/poll jobs no-op).
2. Optionally clear `CHANNELS_ENABLED_PROVIDERS` (empty registry).
3. Disable connection apply:
   `POST .../inventory-apply/disable`
4. Emergency release all imported inventory + pause:
   `POST .../inventory/deactivate`
5. Or disconnect the connection (releases all connection-owned `channel_import`).

Hold/Booking inventory is never released by these paths.

---

## Cleanup semantics

| Event | Behavior |
|---|---|
| Same-epoch absence / `STATUS:CANCELLED` with complete observed evidence | Soft-release matching identities (P1-S7a) |
| Incomplete/failed poll | No cursor advance; no release |
| Credential rotation / mapping epoch bump | Soft-release `channel_import` with `semantic_config_version < new epoch` |
| Disconnect / inventory deactivate | Soft-release all connection-owned active `channel_import` |
| Stale CAS worker | Conflict — cannot release against newer semantic version |

---

## Inventory conflict authority

- **Advisory (booking UX):** `findActiveBlocks` loads all active types; `AvailabilityEvaluator` blocks stays overlapping `channel_import`.
- **Authoritative concurrent lock (ADR-010/022):** PostgreSQL EXCLUDE still covers **hold/booking only** (ADR-023 intentional). Extending EXCLUDE to include `channel_import` requires a reviewed migration and is **not** applied in this batch.

---

## Observability

Structured logs (no secrets / feed URLs / raw ICS):

- `channels.schedule_ical_polls`
- `channels.poll_channel_connection`
- `channels.ical_inventory_reconcile`
- Audit: `channel.connection.imported_inventory_released`, rotation/mapping metadata includes released superseded counts
