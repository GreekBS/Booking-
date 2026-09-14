export function validateCsrf(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return;
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin && host) {
    const originHost = new URL(origin).host;
    if (originHost !== host) {
      throw new Error("CSRF validation failed");
    }
    return;
  }

  const referer = request.headers.get("referer");
  if (referer && host) {
    const refererHost = new URL(referer).host;
    if (refererHost !== host) {
      throw new Error("CSRF validation failed");
    }
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("CSRF validation failed");
  }
}
