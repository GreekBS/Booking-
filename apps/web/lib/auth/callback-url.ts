/**
 * Open-redirect guard for post-login navigation.
 *
 * Only same-origin, path-absolute URLs survive. Anything that could leave the
 * app (absolute URLs, protocol-relative `//host`, backslash tricks) is dropped.
 */

export const DEFAULT_POST_LOGIN_PATH = "/dashboard";

export function isSafeCallbackUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > 512) return false;
  if (!candidate.startsWith("/")) return false;
  if (candidate.startsWith("//")) return false;
  if (candidate.includes("\\")) return false;
  // Auth pages would bounce straight back and loop.
  if (candidate === "/login" || candidate.startsWith("/login?")) return false;
  return true;
}

export function sanitizeCallbackUrl(
  value: string | null | undefined,
  fallback: string = DEFAULT_POST_LOGIN_PATH,
): string {
  return isSafeCallbackUrl(value) ? value!.trim() : fallback;
}

/** Builds `/login?callbackUrl=…`, omitting the parameter when unsafe. */
export function buildLoginUrl(
  requestedPath: string | null | undefined,
): string {
  if (!isSafeCallbackUrl(requestedPath)) return "/login";
  return `/login?callbackUrl=${encodeURIComponent(requestedPath!.trim())}`;
}
