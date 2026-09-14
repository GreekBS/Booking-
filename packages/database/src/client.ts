import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertValidTenantId(tenantId: string): void {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error("Invalid tenant ID format");
  }
}

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

export type PrismaTransactionClient = Prisma.TransactionClient;

export * from "@prisma/client";
