# HCP — Hospitality Commerce Platform

Phase 1: Platform Kernel + Property Catalog

## Setup

```bash
pnpm install
cp .env.example .env
# Configure DATABASE_URL, DIRECT_URL, and AUTH_SECRET
# For DB integration tests / Playwright e2e: set TEST_DATABASE_URL to an isolated
# non-production PostgreSQL database (never Production; never falls back to DATABASE_URL).
# See packages/database/DATABASE_SAFETY.md

pnpm db:generate
pnpm db:push
pnpm db:seed

pnpm dev
```

`pnpm db:seed` loads demo/dev data only. It does **not** grant platform Super Admin
unless you explicitly set `ALLOW_DEV_SUPER_ADMIN_SEED=true` (isolated local DBs only).
Guarded `db:*` scripts refuse the known Talos Production Supabase project unless
`ALLOW_TALOS_PRODUCTION_DB_MUTATION=true` (controlled Production migrate deploy only).

## Default platform Super Admin

Production/shared environments use an operationally provisioned Super Admin
(not created by ordinary `db:seed`).

For isolated local development only:

```bash
ALLOW_DEV_SUPER_ADMIN_SEED=true pnpm db:seed
```

- Email: `admin@hcp.local`
- Password: see `packages/database/seed/devSuperAdmin.ts` (local-only constant)

## Architecture

- `packages/domain` — Pure TypeScript DDD (no framework imports)
- `packages/database` — Prisma repositories
- `apps/web` — Next.js presentation + thin API adapters
