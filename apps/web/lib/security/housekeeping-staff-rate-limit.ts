const hits = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_RESOLVE = 60;
const MAX_UNLOCK = 20;
const MAX_MUTATION = 30;

function hit(key: string, max: number): void {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > max) {
    throw new Error("Too many requests");
  }
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function checkPublicQrResolveRateLimit(request: Request): void {
  hit(`qr-resolve:${clientIp(request)}`, MAX_RESOLVE);
}

export function checkStaffPinUnlockRateLimit(request: Request): void {
  hit(`pin-unlock:${clientIp(request)}`, MAX_UNLOCK);
}

export function checkStaffMutationRateLimit(request: Request): void {
  hit(`hk-mutate:${clientIp(request)}`, MAX_MUTATION);
}
