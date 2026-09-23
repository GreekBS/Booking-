/**
 * TEMPORARY — Production DB RTT measurement helper. Remove after region canary.
 * Allowed to touch Prisma only from lib/diagnostics (same exception class as lib/auth).
 */
import { prisma } from "@hcp/database/client";

const WARMUP = 2;
const SAMPLES = 8;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
}

function summarize(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
}

async function measureMs(n: number, fn: () => Promise<void>): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(Math.round(performance.now() - t0));
  }
  return samples;
}

export type DbRttTimingSummary = ReturnType<typeof summarize>;

export interface DbRttMeasurement {
  temporary: true;
  purpose: "vercel_supabase_region_canary";
  removeAfterCanary: true;
  vercelRegion: string | null;
  vercelEnv: string | null;
  samplesPerMetric: number;
  warmup: number;
  select1: DbRttTimingSummary;
  userLookup: DbRttTimingSummary;
  tenantLookup: DbRttTimingSummary | { skipped: string };
}

/**
 * READ-ONLY warm timings. Caller must already be Super Admin (DB-authoritative).
 * Never returns row payloads, emails, or connection metadata.
 */
export async function measureDbRtt(params: {
  userId: string;
  activeTenantId: string | null;
}): Promise<DbRttMeasurement> {
  for (let i = 0; i < WARMUP; i++) {
    await prisma.$queryRawUnsafe("SELECT 1");
  }

  const select1 = summarize(
    await measureMs(SAMPLES, async () => {
      await prisma.$queryRawUnsafe("SELECT 1");
    }),
  );

  const userLookup = summarize(
    await measureMs(SAMPLES, async () => {
      await prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true },
      });
    }),
  );

  let tenantLookup: DbRttTimingSummary | { skipped: string } = {
    skipped: "no_active_tenant",
  };
  if (params.activeTenantId) {
    tenantLookup = summarize(
      await measureMs(SAMPLES, async () => {
        await prisma.tenant.findUnique({
          where: { id: params.activeTenantId! },
          select: { id: true },
        });
      }),
    );
  }

  return {
    temporary: true,
    purpose: "vercel_supabase_region_canary",
    removeAfterCanary: true,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    samplesPerMetric: SAMPLES,
    warmup: WARMUP,
    select1,
    userLookup,
    tenantLookup,
  };
}
