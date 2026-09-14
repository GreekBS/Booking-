import { describe, expect, it } from "vitest";
import { decodeUtf8Bytes, encodeUtf8Bytes } from "../../../../../src/shared/kernel/Utf8Bytes";
import {
  buildTestWebhookSignature,
  TEST_WEBHOOK_SIGNATURE_HEADER,
} from "../../../../../src/channels/simulation/TestChannelWebhookProvider";
import {
  createChannelWebhookTransportRequest,
  encodeChannelWebhookBody,
} from "../../../../../src/channels/types/ChannelWebhookTransportRequest";
import { toWebhookRequestMeta } from "../../../../../src/channels/application/ChannelWebhookTransportSupport";

export function runUtf8RawBodyContractSuite(): void {
  describe("UTF-8 and raw-body contract", () => {
    it("round-trips ASCII", () => {
      const text = "reservation.create:abc123";
      expect(decodeUtf8Bytes(encodeUtf8Bytes(text))).toBe(text);
    });

    it("round-trips Greek text", () => {
      const text = "Κράτηση πελάτη";
      expect(decodeUtf8Bytes(encodeUtf8Bytes(text))).toBe(text);
    });

    it("round-trips emoji", () => {
      const text = "booking 🏨 confirmed";
      expect(decodeUtf8Bytes(encodeUtf8Bytes(text))).toBe(text);
    });

    it("documents behavior for malformed UTF-8 bytes", () => {
      const malformed = new Uint8Array([0xff, 0xfe, 0xfd]);
      expect(() => decodeUtf8Bytes(malformed)).not.toThrow();
    });

    it("copies bytes defensively at webhook meta boundary", () => {
      const bytes = encodeUtf8Bytes('{"kind":"connectivity.test"}');
      const request = createChannelWebhookTransportRequest({
        tenantId: "tenant",
        connectionId: "connection",
        provider: "manual",
        rawBodyBytes: bytes,
      });
      const meta = toWebhookRequestMeta(request);
      meta.rawBodyBytes[0] = 0x00;
      expect(request.rawBodyBytes[0]).not.toBe(0x00);
    });

    it("verifies signature before decode using exact bytes", () => {
      const body = '[{"messageId":"m1","kind":"connectivity.test"}]';
      const bytes = encodeChannelWebhookBody(body);
      const secret = "utf8-secret";
      const signature = buildTestWebhookSignature(secret, body);
      const request = createChannelWebhookTransportRequest({
        tenantId: "tenant",
        connectionId: "connection",
        provider: "manual",
        headers: { [TEST_WEBHOOK_SIGNATURE_HEADER]: signature },
        rawBodyBytes: bytes,
      });
      const meta = toWebhookRequestMeta(request);
      expect(buildTestWebhookSignature(secret, decodeUtf8Bytes(meta.rawBodyBytes))).toBe(signature);
    });
  });
}
