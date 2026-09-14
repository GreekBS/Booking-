# P1-S7b — Provider-1 operational readiness (automation-capable)

Status: **automation-capable after S7b**. **Not** pilot-activated.
Connection-level apply fence code is **P1-S7c Phase 1**. External cron + real-feed
pilot verification remain after Phase 1 independent closure.

## Surfaces

| Cadence (suggested) | Endpoint | Auth |
|---|---|---|
| ~1m | `POST /api/internal/v1/outbox/dispatch` | `OUTBOX_DISPATCH_SECRET` |
| ~1m | `POST /api/internal/v1/jobs/run` | `BACKGROUND_JOBS_SECRET` |
| ~15m | `POST /api/internal/v1/channels/schedule-ical-polls` | `BACKGROUND_JOBS_SECRET` |

S7b/S7c Phase 1 do **not** configure environment cron. Operators must not claim production-live cron until activation work is separately approved.

## Poll job identities

- `sched:{bucket}` — scheduler
- `manual:{bucket}` — admin manual poll
- `recovery:{deadLetterJobId}` — admin recovery when latest poll is `dead_letter`

`bucket = floor(utcNowMs / intervalMs)`. Default interval 15m (`CHANNELS_ICAL_POLL_INTERVAL_MS`, min 5m).
Jitter 0–10% of interval affects `runAt` only.

In-flight gate: any pending/processing poll for the connection blocks a second enqueue.

Scheduler never auto-recovers dead_letter polls. Pause/resume alone does not enqueue recovery.

## Operator recovery

- ForceRedrive: `POST /api/admin/v1/channel-connections/{id}/reconciliations/{cursorVersion}/force-redrive`
  (pending generation + latest reconcile job `dead_letter|cancelled`; global + connection apply ON; connection active)
- Health: `GET /api/admin/v1/channel-connections/{id}/health`
- Enable apply: `POST /api/admin/v1/channel-connections/{id}/inventory-apply/enable`
- Disable apply: `POST /api/admin/v1/channel-connections/{id}/inventory-apply/disable`
- Emergency inventory rollback: `POST /api/admin/v1/channel-connections/{id}/inventory/deactivate`
  (pauses connection + releases all active `channel_import` for that connection / all epochs)

Pilot rollback sequence: **disable → inventory/deactivate**.

See `docs/p1-s7c-phase1-connection-apply-fence.md`.
