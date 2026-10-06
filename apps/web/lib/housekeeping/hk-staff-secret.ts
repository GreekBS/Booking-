/**
 * Resolve the HMAC secret for hk_staff housekeeping capabilities.
 *
 * Production: HK_STAFF_CAPABILITY_SECRET is required (fail closed).
 * No insecure hardcoded fallback in production.
 *
 * Non-production: prefer HK_STAFF_CAPABILITY_SECRET, else AUTH_SECRET /
 * NEXTAUTH_SECRET (namespaced), else an explicit test/dev fallback when
 * NODE_ENV=test or ALLOW_HK_STAFF_DEV_SECRET=true.
 */
import "server-only";

export function resolveHkStaffCapabilitySecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const dedicated = env.HK_STAFF_CAPABILITY_SECRET?.trim();
  if (dedicated && dedicated.length >= 16) {
    return dedicated;
  }

  const isProduction =
    env.NODE_ENV === "production" || env.VERCEL_ENV === "production";

  if (isProduction) {
    throw new Error(
      "HK_STAFF_CAPABILITY_SECRET is required in production (min 16 chars). " +
        "Refusing insecure capability signing fallback.",
    );
  }

  const auth = env.AUTH_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (auth && auth.length >= 16) {
    return `hk_staff:${auth}`;
  }

  if (env.NODE_ENV === "test" || env.ALLOW_HK_STAFF_DEV_SECRET === "true") {
    return "hk_staff_dev_secret_do_not_use_in_prod";
  }

  throw new Error(
    "HK_STAFF_CAPABILITY_SECRET (or AUTH_SECRET in non-production) is required",
  );
}
