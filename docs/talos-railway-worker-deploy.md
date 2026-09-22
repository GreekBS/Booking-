# Talos Railway Worker — Deployment Runbook

**Status:** Deployment support. Do **not** activate Production worker until a separate GO.

Approved worker commits: `a46b906`, `158729f`, `49ede46` (+ Railway build-fix commit).

Architecture:

```text
Vercel Hobby     → Talos web/API
Railway          → always-on apps/worker (@hcp/worker only)
Supabase Postgres → durable jobs / outbox / inbox / inventory
```

Vercel Cron is **not** required for core execution.

---

## Why config lives at the repo root

Railway with **Root Directory = `/`** looks for `railway.toml` / `railpack.json` at the **repository root**.

A config file only under `apps/worker/` is **not** auto-loaded. That caused Railpack to auto-detect Next.js (and fail with an Nx/Next selection error) instead of using the worker build/start.

Authoritative files:

- `/railway.toml` — Railway build/deploy (worker-only commands)
- `/railpack.json` — Railpack build/start override (bypasses Nx/Next detection)

---

## A. Create / fix Railway service

1. Railway → open the **existing** worker service (do not recreate the project unless necessary).
2. Confirm the service is linked to the Talos GitHub repository.
3. This service is **only** the async worker — not Next.js.

## B. ONE-TIME dashboard settings (exact)

Open the worker service → **Settings**:

| Field | Exact value |
| --- | --- |
| **Root Directory** | leave empty / `/` (repository root). Do **not** set `apps/worker`. |
| **Config as Code** / **Railway Config File** | `/railway.toml` |
| **Builder** | Railpack (default). Do not force Nixpacks unless you know why. |
| **Build Command** | leave empty to use `railway.toml`, **or** set exactly: `pnpm run worker:railway:build` |
| **Start / Custom Start Command** | leave empty to use `railway.toml`, **or** set exactly: `pnpm run worker:railway:start` |
| **Watch Paths** (if present) | prefer values from `railway.toml` (`apps/worker`, `packages`, lockfiles) |

Do **not** set `RAILPACK_NX_APP` (that would target a Next.js app).

Do **not** set Root Directory to `apps/web` or `apps/worker`.

## C. Build / start (what runs)

1. Railpack/pnpm install at workspace root (from lockfile)
2. `pnpm run worker:railway:build` → Prisma generate + worker typecheck
3. `pnpm run worker:railway:start` → persistent `tsx` worker (`@hcp/worker`)

Platform env is authoritative. Local `.env` / `.env.local` are **not** loaded when `RAILWAY_ENVIRONMENT`, `NODE_ENV=production`, or `TALOS_WORKER_RUNTIME_MODE=production` is set.

## D. Environment variable NAMES only

Never put values in git or chat.

**Database / safety**

- `WORKER_DATABASE_URL`
- `WORKER_LISTEN_DATABASE_URL`
- `DIRECT_URL` (optional if listen URL set)
- `TALOS_WORKER_RUNTIME_MODE` — leave **unset** for non-Production smoke
- `ALLOW_TALOS_PRODUCTION_DB_MUTATION` — leave **unset** for non-Production smoke

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

Startup refuses LISTEN on transaction pooler port **`:6543`**. Never log URLs.

## F. Production dual-gate safety

Production DB refused unless **both** are set on the Railway worker service only:

1. `TALOS_WORKER_RUNTIME_MODE=production`
2. `ALLOW_TALOS_PRODUCTION_DB_MUTATION=true`

Leave both **unset** for non-Production verification.

## G–J. Schedulers, verification, rollback, credentials

Unchanged from prior runbook intent: see earlier sections in git history / keep schedulers safe on isolated DB; verify `/healthz` + logs; stop service to roll back; never put Production credentials on laptops.

---

## First deployment mode (non-Production)

1. Apply ONE-TIME dashboard settings above.
2. Set isolated non-Production `WORKER_DATABASE_URL` + session/direct `WORKER_LISTEN_DATABASE_URL`.
3. Leave Production dual-gate vars unset.
4. **Redeploy** (after settings saved).
5. Confirm build uses `worker:railway:build` (not `nx` / `next build`).
6. Confirm start is `worker:railway:start` and `/healthz` responds.

Production activation remains a separate explicit GO.
