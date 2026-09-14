import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelWebhookVerificationResult } from "../types/ChannelProviderMessage";
import type { ChannelWebhookRequestMeta } from "../types/ChannelWebhookTransportTypes";
import type { ChannelWebhookVerifyContext } from "../types/ChannelTransportExecutionContext";
import type { IChannelWebhookProvider } from "../ports/providers/IChannelWebhookProvider";
import { decodeUtf8Bytes } from "../../shared/kernel/Utf8Bytes";

export const TEST_WEBHOOK_SIGNATURE_HEADER = "x-test-channel-signature";

export class TestChannelWebhookProvider implements IChannelWebhookProvider {
  private parseHandler: ((payload: unknown) => Promise<ChannelProviderMessage[]>) | null = null;

  setParseHandler(
    handler: ((payload: unknown) => Promise<ChannelProviderMessage[]>) | null,
  ): void {
    this.parseHandler = handler;
  }

  async verify(
    request: ChannelWebhookRequestMeta,
    context: ChannelWebhookVerifyContext,
  ): Promise<ChannelWebhookVerificationResult> {
    const secret = context.webhookSecret;
    if (!secret) {
      return { accepted: true, connectionId: "test-connection" };
    }

    const provided = request.headers[TEST_WEBHOOK_SIGNATURE_HEADER];
    if (!provided) {
      return { accepted: false, reason: "invalid_signature" };
    }

    const bodyText = readRawBodyText(request);
    const expected = buildTestWebhookSignature(secret, bodyText);
    if (provided !== expected) {
      return { accepted: false, reason: "invalid_signature" };
    }

    return { accepted: true, connectionId: "test-connection" };
  }

  async parse(payload: unknown): Promise<ChannelProviderMessage[]> {
    if (this.parseHandler) {
      return this.parseHandler(payload);
    }

    if (!Array.isArray(payload)) {
      throw new Error("Test webhook payload must be an array of provider messages");
    }

    return payload.map((entry) => {
      const message = entry as ChannelProviderMessage;
      return {
        ...message,
        receivedAt:
          message.receivedAt instanceof Date
            ? message.receivedAt
            : new Date(String(message.receivedAt)),
      };
    });
  }
}

export function buildTestWebhookSignature(secret: string, rawBody: string): string {
  return `${secret}:${rawBody}`;
}

function readRawBodyText(request: ChannelWebhookRequestMeta): string {
  if (request.rawBodyBytes) {
    return decodeUtf8Bytes(request.rawBodyBytes);
  }
  return request.rawBody;
}
