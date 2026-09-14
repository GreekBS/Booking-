import { ValidationError } from "@hcp/domain";

const hits = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_IP = 120;
const MAX_REQUESTS_PER_KEY = 300;

export function checkStorefrontRateLimit(request: Request, publishableKeyId?: string): void {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  enforceBucket(`ip:${ip}`, MAX_REQUESTS_PER_IP);

  if (publishableKeyId) {
    enforceBucket(`key:${publishableKeyId}`, MAX_REQUESTS_PER_KEY);
  }
}

function enforceBucket(bucket: string, maxRequests: number): void {
  const now = Date.now();
  const entry = hits.get(bucket);

  if (!entry || now > entry.resetAt) {
    hits.set(bucket, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  entry.count += 1;
  if (entry.count > maxRequests) {
    throw new ValidationError("Rate limit exceeded");
  }
}
