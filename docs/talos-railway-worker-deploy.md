# Talos Railway Worker — Deployment Runbook

**Status:** Deployment support only. Do **not** activate Production worker until a separate GO.

Approved worker commits: `a46b906`, `158729f`.

Architecture:

```text
Vercel Hobby     → Talos web/API
Railway          → always-on apps/worker
Supabase Postgres → durable jobs / outbox / inbox / inventory
```

Vercel Cron is **not** required for core execution.

---

## A. Create Railway service

1. Railway → New Project → Deploy from GitHub → select the Talos monorepo.
2. Create **one** service for the async worker (not the Next.js web app).
3. **Root Directory:** leave as repository root `/` (required for pnpm workspaces).
4. Do **not** set Root Directory to `apps/worker`.

## B. Deploy from monorepo root

Use Config-as-Code at `apps/worker/railway.toml` **or** paste equivalent commands:

| Setting | Value |
| --- | --- |
| Build command | `pnpm install --frozen-lockfile && pnpm run worker:railway:build` |
| Start command | `pnpm run worker:railway:start` |
| Restart | On failure (see railway.toml) |
| Healthcheck path | `/healthz` |

`worker:railway:build` runs Prisma generate + worker typecheck.  
`worker:railway:start` runs `tsx` on `apps/worker/src/index.ts`.

## C. Build / start (what runs)

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @hcp/database db:generate`
3. `pnpm --filter @hcp/worker typecheck`
4. Start: `pnpm --filter @hcp/worker start` (persistent process; SIGTERM graceful)

Platform env is authoritative. Local `.env` / `.env.local` are **not** loaded when `RAILWAY_ENVIRONMENT`, `NODE_ENV=production`, or `TALOS_WORKER_RUNTIME_MODE=production` is set.

## D. Environment variable NAMES only

Never put values in git, Railway config files, or chat.

**Database / safety**

- `WORKER_DATABASE_URL`
- `WORKER_LISTEN_DATABASE_URL`
- `DIRECT_URL` (optional if listen URL set)
- `TALOS_WORKER_RUNTIME_MODE`
- `ALLOW_TALOS_PRODUCTION_DB_MUTATION`

**Worker**

- `WORKER_RECOVERY_INTERVAL_MS`
- `WORKER_JOB_BATCH_LIMIT`
- `WORKER_OUTBOX_BATCH_LIMIT`
- `WORKER_LISTENER_RECONNECT_INITIAL_MS`
- `WORKER_LISTENER_RECONNECT_MAX_MS`
- `WORKER_HEALTH_PORT` (optional; Railway `PORT` used by default)
- `BACKGROUND_JOBS_WORKER_ID`

**Schedulers**

- `WORKER_ICAL_SCHEDULER_ENABLED`
- `WORKER_ICAL_SCHEDULER_INTERVAL_MS`
- `WORKER_HOLD_EXPIRY_SCHEDULER_ENABLED`
- `WORKER_HOLD_EXPIRY_SCHEDULER_INTERVAL_MS`
- `WORKER_HOLD_EXPIRY_JOB_LIMIT`
- `WORKER_PROVIDER_RETRIEVAL_SCHEDULER_ENABLED`
- `WORKER_PROVIDER_RETRIEVAL_SCHEDULER_INTERVAL_MS`

**Channel behavior (same semantics as web DI)**

- `CHANNELS_POLLING_ENABLED`
- `CHANNELS_ENABLED_PROVIDERS`
- `CHANNELS_INVENTORY_APPLY_ENABLED`
- `CHANNELS_CREDENTIALS_MASTER_KEY`
- `CHANNELS_ICAL_POLL_INTERVAL_MS`

## E. Supabase connection guidance

| Role | Variable | Allowed |
| --- | --- | --- |
| Prisma processing | `WORKER_DATABASE_URL` | Transaction pooler (`:6543`), session (`:5432`), or direct |
| LISTEN/NOTIFY | `WORKER_LISTEN_DATABASE_URL` | **Session `:5432` or direct only** |

- **Must not** use transaction pooler port **`:6543`** for LISTEN (startup refuses it).
- Prefer session pooler on IPv4-only Railway if direct DB host is IPv6-only.
- Direct `db.<ref>.supabase.co:5432` is fine when the platform can reach it (IPv6 or IPv4 add-on).

Worker never logs connection URLs.

## F. Production dual-gate safety

Production DB is refused unless **both** are set on the Railway worker service only:

1. `TALOS_WORKER_RUNTIME_MODE=production`
2. `ALLOW_TALOS_PRODUCTION_DB_MUTATION=true`

Do **not** set these on developer laptops or Vercel for this path.  
Do **not** set them during the first non-Production verification deploy.

## G. Scheduler enablement

Defaults (when env unset): iCal + hold-expiry **enabled**; provider retrieval **disabled**.

For a quiet first boot against a non-Production DB you may set:

- `WORKER_ICAL_SCHEDULER_ENABLED=false`
- `WORKER_HOLD_EXPIRY_SCHEDULER_ENABLED=false`

Re-enable when ready. iCal discovery still respects `CHANNELS_POLLING_ENABLED` inside the use case.

## H. Verification (logs / health)

Expect structured logs (no secrets):

- `worker_started`
- `health_server_listening`
- `listener_connected` (or reconnect / failure while degraded)
- `scheduler_hook_started` / `scheduler_hook_disabled`
- `job_batch_processed` / `outbox_batch_processed` when work exists

`GET /healthz` JSON (no URLs/secrets):

- `status`: `ok` | `degraded` | `starting`
- `processingDbOk`
- `listener`: `connected` | `disconnected`
- `recoveryLoopAlive`
- `schedulerAlive`

**Degraded LISTEN** with `recoveryLoopAlive: true` still returns HTTP 200 so Railway does not flap-restart; job execution continues via recovery sweep.

## I. Stop / rollback

1. Railway → Stop service / remove deploy / scale to zero.
2. Optionally set scheduler enables to `false` before any restart.
3. Leave `background_jobs` / `outbox_events` intact.
4. Use existing operator inventory deactivate / apply-off if needed.
5. Remove Production secrets from Railway after stop.

## J. Credentials hygiene

- Never put Production DB credentials on developer laptops for worker activation.
- Configure Production URLs and dual-gate flags **only** in Railway service variables.
- Never commit secrets or paste them into chat/logs.

---

## First deployment mode (non-Production)

Before Production activation:

1. Deploy Railway worker with **isolated non-Production** `WORKER_DATABASE_URL` + session/direct `WORKER_LISTEN_DATABASE_URL`.
2. Leave `TALOS_WORKER_RUNTIME_MODE` unset; leave `ALLOW_TALOS_PRODUCTION_DB_MUTATION` unset.
3. Verify boot, `/healthz`, LISTEN connected, recovery alive, schedulers init, restart.
4. Do **not** fall back to Production DB if a test DB is unavailable.
5. Do **not** process Production pilot job `f90c1f17-…` in this phase.

Production activation is a **separate** explicit GO.
