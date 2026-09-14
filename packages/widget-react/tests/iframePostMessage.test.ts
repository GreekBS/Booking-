import { describe, it, expect } from "vitest";
import { wrapIframeMessage, parseIframeMessage, isAllowedOrigin } from "../src/iframePostMessage.js";

describe("iframe postMessage contract (widget-react)", () => {
  it("wraps and parses booking completed message", () => {
    const wrapped = wrapIframeMessage({
      type: "hcp:booking_completed",
      confirmationCode: "HCP-123",
      bookingId: "booking_1",
    });
    const parsed = parseIframeMessage(wrapped);
    expect(parsed?.type).toBe("hcp:booking_completed");
  });

  it("validates allowed origins", () => {
    expect(isAllowedOrigin("https://app.example.com", ["*.example.com"])).toBe(true);
    expect(isAllowedOrigin("https://evil.com", ["*.example.com"])).toBe(false);
  });
});
