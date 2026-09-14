/**
 * CM-4b S4a-2b — max webhook request body size (1 MiB).
 * Enforced via Content-Length (when present) and streamed byte accumulation.
 */
export const CHANNEL_WEBHOOK_MAX_BODY_BYTES = 1_048_576;

export class WebhookPayloadTooLargeError extends Error {
  readonly code = "PAYLOAD_TOO_LARGE";

  constructor(message = "Webhook payload too large") {
    super(message);
    this.name = "WebhookPayloadTooLargeError";
  }
}

/**
 * Read webhook raw body once as Uint8Array without JSON/text decoding.
 * Rejects when Content-Length or accumulated bytes exceed maxBytes.
 */
export async function readWebhookRawBody(
  request: Request,
  maxBytes: number = CHANNEL_WEBHOOK_MAX_BODY_BYTES,
): Promise<Uint8Array> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader != null && contentLengthHeader.trim() !== "") {
    const declared = Number(contentLengthHeader);
    if (!Number.isFinite(declared) || declared < 0) {
      throw new WebhookPayloadTooLargeError("Invalid Content-Length");
    }
    if (declared > maxBytes) {
      throw new WebhookPayloadTooLargeError();
    }
  }

  if (!request.body) {
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new WebhookPayloadTooLargeError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof WebhookPayloadTooLargeError) {
      throw error;
    }
    throw error;
  }

  if (chunks.length === 0) {
    return new Uint8Array(0);
  }
  if (chunks.length === 1) {
    return chunks[0]!;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Copy request headers for provider-neutral webhook verification.
 *
 * Preserves Authorization and provider signature/verification headers.
 * Excludes only browser session Cookie material — not part of provider verification.
 * Do not log returned header values (may contain secrets).
 */
export function collectWebhookHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() === "cookie") {
      return;
    }
    headers[key] = value;
  });
  return headers;
}
