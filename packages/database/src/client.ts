import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaBase: PrismaClient | undefined;
  prisma: PrismaClient | undefined;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertValidTenantId(tenantId: string): void {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error("Invalid tenant ID format");
  }
}

/**
 * Resolve the Prisma connection URL for application runtime.
 * Prefers RUNTIME_DATABASE_URL (non-BYPASSRLS role) when set.
 */
export function resolveRuntimeDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const runtime = env.RUNTIME_DATABASE_URL?.trim();
  if (runtime) return runtime;
  return env.DATABASE_URL?.trim() || undefined;
}

function createBasePrismaClient(): PrismaClient {
  const url = resolveRuntimeDatabaseUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(url ? { datasources: { db: { url } } } : {}),
  });
}

const basePrisma =
  globalForPrisma.prismaBase ?? createBasePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = basePrisma;
}

type TenantTxStore = {
  tenantId: string;
  tx: Prisma.TransactionClient;
};

const tenantTxAls = new AsyncLocalStorage<TenantTxStore>();

const DEFAULT_TX_OPTIONS = {
  maxWait: 60_000,
  timeout: 60_000,
} as const;

/**
 * SET LOCAL app.current_tenant — must run inside an interactive transaction.
 * Do not rely on session GUC across pooled connections.
 */
export async function setTenantContext(
  client: PrismaClient | Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  assertValidTenantId(tenantId);
  await client.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
}

export async function clearTenantContext(
  client: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  await client.$executeRaw`SELECT set_config('app.current_tenant', '', true)`;
}

/**
 * Run work under a tenant-scoped interactive transaction with SET LOCAL.
 * Nested calls with the same tenantId reuse the active transaction (no nested TX).
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxWait?: number; timeout?: number } = DEFAULT_TX_OPTIONS,
): Promise<T> {
  assertValidTenantId(tenantId);
  const existing = tenantTxAls.getStore();
  if (existing) {
    if (existing.tenantId !== tenantId) {
      throw new Error(
        `Nested withTenantTransaction tenant mismatch: ${existing.tenantId} vs ${tenantId}`,
      );
    }
    return fn(existing.tx);
  }

  return basePrisma.$transaction(async (tx) => {
    await setTenantContext(tx, tenantId);
    return tenantTxAls.run({ tenantId, tx }, () => fn(tx));
  }, options);
}

/** Active tenant TX when inside withTenantTransaction; otherwise null. */
export function getTenantTransaction(): Prisma.TransactionClient | null {
  return tenantTxAls.getStore()?.tx ?? null;
}

export function requireTenantTransaction(): Prisma.TransactionClient {
  const tx = getTenantTransaction();
  if (!tx) {
    throw new Error(
      "requireTenantTransaction() called outside withTenantTransaction()",
    );
  }
  return tx;
}

function createAlsAwarePrisma(base: PrismaClient): PrismaClient {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (
        prop === "$disconnect" ||
        prop === "$connect" ||
        prop === "$on" ||
        prop === "$extends" ||
        prop === "$use"
      ) {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }

      if (prop === "$transaction") {
        const store = tenantTxAls.getStore();
        if (store) {
          return async (arg: unknown): Promise<unknown> => {
            if (typeof arg === "function") {
              return (arg as (tx: Prisma.TransactionClient) => Promise<unknown>)(
                store.tx,
              );
            }
            // Array/batch form cannot join an open interactive TX safely.
            throw new Error(
              "Batch $transaction is not supported inside withTenantTransaction",
            );
          };
        }
        return target.$transaction.bind(target);
      }

      const store = tenantTxAls.getStore();
      const client = store ? store.tx : target;
      const value = Reflect.get(client, prop, client);
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    },
  }) as PrismaClient;
}

/**
 * Tenant-aware Prisma client.
 * Inside withTenantTransaction(), delegates to the interactive TX (SET LOCAL applies).
 * Outside, uses the base pool (FORCE RLS fail-closed when GUC unset on non-bypass roles).
 */
export const prisma =
  globalForPrisma.prisma ?? createAlsAwarePrisma(basePrisma);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Privileged base client (no ALS proxy) — migrations/admin scripts only. */
export const prismaAdmin = basePrisma;

export type PrismaTransactionClient = Prisma.TransactionClient;

export * from "@prisma/client";
