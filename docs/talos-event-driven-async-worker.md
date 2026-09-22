# Talos Event-Driven Async Worker Foundation

## Status

**IMPLEMENTED (foundation).** Always-on worker process + LISTEN/NOTIFY wake + recovery sweep.

**Not activated in Production.** Do not set `TALOS_WORKER_RUNTIME_MODE=production` or point the worker at the Talos Production database until a separate activation batch.

## Layering

| Concern | Authority |
| --- | --- |
| **DURABILITY** | PostgreSQL `background_jobs` / `outbox_events` (and Channel Inbox) |
| **EXECUTION** | Always-on worker (`apps/worker`) invoking `ProcessJobBatchUseCase` / `ProcessOutboxBatchUseCase` directly |
| **WAKE-UP** | PostgreSQL `LISTEN` / `NOTIFY` on `talos_async_jobs` / `talos_async_outbox` (best-effort only) |
| **RECOVERY** | Worker sweep every ~1–3 seconds (default 2s) |
| **SCHEDULING** | Future worker timers / external schedules for provider polling and delayed workloads |

**Cron is not the primary reservation-critical execution engine.**

Internal HTTP endpoints remain for manual/ops/recovery:

- `POST /api/internal/v1/jobs/run`
- `POST /api/internal/v1/outbox/dispatch`
- `POST /api/internal/v1/channels/schedule-ical-polls`

The worker **must not** call these HTTP endpoints.

## Transaction semantics (NOTIFY)

1. Durable `INSERT`/`create` of a job or outbox row happens in PostgreSQL.
2. `SELECT pg_notify(channel, '')` is issued on the **same transaction client** whenever possible.
3. PostgreSQL delivers `NOTIFY` **only after that transaction commits**.
4. Wake payload is empty — never secrets, credentials, feed URLs, reservation data, or business payloads.
5. Failure to `NOTIFY` is swallowed (best-effort). It **must not** fail the business write.
6. Lost/missing wake is harmless: the recovery sweep claims due pending work within ~1–3 seconds.

## Reservation path (unchanged)

```text
Provider
→ ReceiveChannelEventUseCase
→ Inbox
→ process_channel_inbox job
→ CM-3a
→ CM-3b-3
→ Commerce
→ PostgreSQL EXCLUDE
→ Booking
```

ADR-022 remains constitutional. The worker is orchestration only — it does not write Booking/inventory directly or bypass Channel ingress.

## Database safety

- Prefer `WORKER_DATABASE_URL` (else `DATABASE_URL`).
- Optional `WORKER_LISTEN_DATABASE_URL` / `DIRECT_URL` for LISTEN (session/direct connection; transaction poolers often reject LISTEN).
- Refuses Talos Production unless future `TALOS_WORKER_RUNTIME_MODE=production` **and** the existing mutation allow-list — local/dev has no easy Production escape hatch.

## Local run

```bash
pnpm --filter @hcp/worker start
```

Required: safe non-production `WORKER_DATABASE_URL` (or `DATABASE_URL`).

## Next batch

Scheduler hooks (iCal poll interval, hold expiry, Booking.com retrieval) — structure exists via `schedulerHooks`; not activated here.
