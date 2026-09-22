/**
 * Validate worker LISTEN database URL compatibility.
 *
 * LISTEN/NOTIFY requires a session-sticky connection:
 * - direct PostgreSQL (:5432), or
 * - Supavisor/PgBouncer session mode (:5432)
 *
 * Transaction pooler (:6543) is NOT compatible — reject at startup.
 * Never log the URL or credentials.
 */

export const LISTEN_TRANSACTION_POOLER_REFUSAL_MESSAGE =
  "WORKER_LISTEN_DATABASE_URL must not use a transaction pooler (port 6543). " +
  "Use a direct PostgreSQL URL or session-mode pooler on port 5432 for LISTEN/NOTIFY.";

/**
 * Heuristic: Supabase/PgBouncer transaction pooling commonly uses port 6543
 * and/or pgbouncer=true on that port.
 */
export function isTransactionPoolerDatabaseUrl(
  connectionUrl: string | undefined | null,
): boolean {
  if (!connectionUrl || typeof connectionUrl !== "string") return false;
  const trimmed = connectionUrl.trim();
  if (!trimmed) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  const port = parsed.port || defaultPortForProtocol(parsed.protocol);
  if (port === "6543") return true;

  // Explicit transaction-pooler query flag on non-standard setups.
  const params = parsed.searchParams;
  if (
    params.get("pgbouncer") === "true" &&
    (port === "6543" || params.get("pool_mode") === "transaction")
  ) {
    return true;
  }
  if (params.get("pool_mode") === "transaction") return true;

  return false;
}

function defaultPortForProtocol(protocol: string): string {
  if (protocol === "postgres:" || protocol === "postgresql:") return "5432";
  return "";
}

/**
 * Throws a safe Error (no URL/secrets) when the listen target is a transaction pooler.
 */
export function assertListenDatabaseUrlCompatible(
  connectionUrl: string | undefined | null,
): void {
  if (!connectionUrl || !connectionUrl.trim()) {
    throw new Error(
      "WORKER_LISTEN_DATABASE_URL (or DIRECT_URL / fallback) is missing. " +
        "LISTEN requires a session/direct PostgreSQL connection.",
    );
  }
  if (isTransactionPoolerDatabaseUrl(connectionUrl)) {
    throw new Error(LISTEN_TRANSACTION_POOLER_REFUSAL_MESSAGE);
  }
}
