# Talos Event-Driven Async Worker

## Status

**IMPLEMENTED:** Worker foundation + scheduler batch.

**Not activated in Production.** Do not set `TALOS_WORKER_RUNTIME_MODE=production` or point the worker at the Talos Production database until a separate deployment/activation design.

## Final execution model

### EVENT-DRIVEN (immediate)

```text
durable write (background_jobs / outbox_events)
→ best-effort LISTEN/NOTIFY wake
→ always-on worker claims via existing use cases
→ handlers
```

Examples:

- Webhook reservation → Inbox + `process_channel_inbox` job → immediate wake/processing
- Any durable job/outbox insert → wake → drain

### SCHEDULED (discovery / time-based)

```text
worker scheduler timer (independent cadence)
→ existing application use case (enqueue only)
→ durable background_jobs row
→ wake
→ same worker drain path
```

Examples:

| Workload | Cadence (default) | Mechanism |
| --- | --- | --- |
| iCal discovery | ~15 minutes | `ScheduleIcalPollsUseCase` → `poll_channel_connection` (+ sweep) |
| Hold expiry | 60 seconds | `EnqueueJobUseCase(expire_holds)` → `ExpireHoldsJobHandler` |
| Future OTA retrieval | configurable (seconds possible) | provider port → `ReceiveChannelEventUseCase` only |
| Recovery sweep | ~1–3 seconds | claim due pending jobs/outbox even if NOTIFY lost |

**Hold expiry cadence rationale:** default hold TTL is 15 minutes (ADR-011). A 60s scheduler tick releases expired holds within about one minute without Vercel Cron. Minute-bucket idempotency (`expire_holds:YYYY-MM-DDTHH:MM`) keeps multiple worker replicas converged on one durable job per minute.

### RECOVERY

Periodic worker sweep (~1–3s) claims due pending work. Lost NOTIFY is harmless.

### Cron

Optional external safety / ops only (`POST /api/internal/v1/jobs/run`, `outbox/dispatch`, `schedule-ical-polls`). **Not** required for core reservation-critical execution.

## Layering

| Concern | Authority |
| --- | --- |
| **DURABILITY** | PostgreSQL `background_jobs` / `outbox_events` / Channel Inbox |
| **EXECUTION** | Always-on worker (`apps/worker`) → `ProcessJobBatchUseCase` / `ProcessOutboxBatchUseCase` |
| **WAKE-UP** | `LISTEN` / `NOTIFY` on `talos_async_jobs` / `talos_async_outbox` |
| **RECOVERY** | Worker sweep every ~1–3 seconds |
| **SCHEDULING** | `SchedulerRunner` hooks with **independent** cadences |

## Multi-replica semantics

Schedulers do **not** require a singleton worker.

- **iCal:** `ScheduleIcalPollsUseCase` uses bucket idempotency keys + in-flight gates.
- **Hold expiry:** minute-bucket `expire_holds:…` idempotency key.
- **In-process:** each hook skips overlapping ticks while a previous invocation is running.
- Across replicas, duplicate ticks are safe; durable enqueue converges.

## Scheduler enablement (env)

| Variable | Default | Purpose |
| --- | --- | --- |
| `WORKER_ICAL_SCHEDULER_ENABLED` | `true` | Run iCal discovery hook |
| `WORKER_ICAL_SCHEDULER_INTERVAL_MS` | `900000` (15m) | Discovery tick interval (min 60s) |
| `WORKER_HOLD_EXPIRY_SCHEDULER_ENABLED` | `true` | Enqueue `expire_holds` |
| `WORKER_HOLD_EXPIRY_SCHEDULER_INTERVAL_MS` | `60000` | Hold-expiry tick (min 10s) |
| `WORKER_HOLD_EXPIRY_JOB_LIMIT` | `100` | Payload limit for expire job |
| `WORKER_PROVIDER_RETRIEVAL_SCHEDULER_ENABLED` | `false` | Future OTA retrieval |
| `WORKER_PROVIDER_RETRIEVAL_SCHEDULER_INTERVAL_MS` | `30000` | Future retrieval cadence |

iCal discovery still respects existing `CHANNELS_POLLING_ENABLED` inside `ScheduleIcalPollsUseCase` (architecture requirement). Worker enablement is independent of unrelated web UI flags.

## Transaction semantics (NOTIFY)

Unchanged from foundation: transactional `pg_notify` after durable insert; best-effort; empty payload; recovery sweep covers loss.

## Reservation path (unchanged)

```text
Provider
→ ReceiveChannelEventUseCase
→ Inbox
→ process_channel_inbox job
→ CM-3a → CM-3b-3 → Commerce → PostgreSQL EXCLUDE → Booking
```

ADR-022 remains constitutional. Schedulers enqueue only; they never write Booking/inventory/Inbox directly.

## Local run

```bash
pnpm --filter @hcp/worker start
```

Required: safe non-production `WORKER_DATABASE_URL` (or `DATABASE_URL`).

## Next

Production worker activation is a separate GO.
Railway config: `/railway.toml` + `/railpack.json` (repo root). Runbook: `docs/talos-railway-worker-deploy.md`.
