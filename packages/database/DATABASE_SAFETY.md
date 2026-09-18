# Database target safety

Talos separates database roles so local development and automated tests cannot
accidentally mutate Production.

## Environment contract

| Variable | Role |
| --- | --- |
| `DATABASE_URL` | Application / local development database (Prisma runtime). |
| `DIRECT_URL` | Direct (non-pooler) URL for migrations when using a pooler. |
| `TEST_DATABASE_URL` | **Only** URL used by database integration tests and Playwright e2e mutation setup. |
| `TEST_DIRECT_URL` | Optional direct URL for tests; defaults to `TEST_DATABASE_URL`. |

Rules:

- Production credentials must **never** be used for local integration tests or e2e setup.
- Integration tests require an isolated disposable / non-production PostgreSQL database.
- `TEST_DATABASE_URL` **does not** fall back to `DATABASE_URL`. If unset, DB integration suites skip (or e2e fails closed) — no mutation occurs.
- The known Talos Production Supabase project (`eofmpszxlumqequjqcmp`) is rejected by test and local mutation tooling.
- Secrets must not be committed (`.env` is gitignored; use `.env.example` only).

Identification uses the Supabase project reference in the connection username
(`postgres.<project-ref>`), not the shared pooler hostname alone.

## Package scripts (guarded)

These refuse Talos Production unless `ALLOW_TALOS_PRODUCTION_DB_MUTATION=true`:

- `pnpm --filter @hcp/database db:migrate` (`migrate deploy`)
- `pnpm --filter @hcp/database db:migrate:dev`
- `pnpm --filter @hcp/database db:push`
- `pnpm --filter @hcp/database db:studio`
- `pnpm --filter @hcp/database db:seed`

Intentional Production migration deploy:

```bash
ALLOW_TALOS_PRODUCTION_DB_MUTATION=true pnpm --filter @hcp/database db:migrate
```

## Integration tests

Database integration suites import `tests/integration/integrationGate.ts`, which:

1. Loads `packages/database/.env` (if present)
2. Applies `TEST_DATABASE_URL` only (never falls back to `DATABASE_URL`)
3. Exports `runIntegration` / `integrationDatabaseConfigured` so suites **skip** when unset

Vitest also uses an empty `envDir` so Vite does not re-inject Production `.env` into the test process after the remap.

`truncateIntegrationTables` refuses Talos Production as defense-in-depth.


`npx prisma …` / `prisma migrate …` invoked **outside** the package scripts above
are **not** intercepted. Do not treat raw Prisma CLI as protected. Prefer the
guarded `db:*` scripts.

## Seed coexistence

Production-safe Super Admin seed gating (`ALLOW_DEV_SUPER_ADMIN_SEED`) is unchanged.
The Production project guard runs in addition to that gate.
