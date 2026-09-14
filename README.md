# HCP — Hospitality Commerce Platform

Phase 1: Platform Kernel + Property Catalog

## Setup

```bash
pnpm install
cp .env.example .env
# Configure DATABASE_URL and AUTH_SECRET

pnpm db:generate
pnpm db:push
pnpm db:seed

pnpm dev
```

## Default super admin

- Email: `admin@example.com` (from `.env`)
- Password: `change-me-in-production` (from `.env`)

## Architecture

- `packages/domain` — Pure TypeScript DDD (no framework imports)
- `packages/database` — Prisma repositories
- `apps/web` — Next.js presentation + thin API adapters
