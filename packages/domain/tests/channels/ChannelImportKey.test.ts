import { describe, it, expect } from "vitest";
import { ChannelImportKey } from "../../src/channels/domain/value-objects/ChannelImportKey";
import { ValidationError } from "../../src/shared/errors/DomainError";

describe("ChannelImportKey", () => {
  it("builds the canonical channel import key format", () => {
    const key = ChannelImportKey.create("conn-123", "ota-res-456");
    expect(key.value).toBe("channel:conn-123:ota-res-456");
  });

  it("trims connection and external reservation ids", () => {
    const key = ChannelImportKey.create("  conn-123  ", "  ota-res-456  ");
    expect(key.value).toBe("channel:conn-123:ota-res-456");
  });

  it("rejects empty connection id", () => {
    expect(() => ChannelImportKey.create("", "ota-res-456")).toThrow(ValidationError);
  });

  it("rejects empty external reservation id", () => {
    expect(() => ChannelImportKey.create("conn-123", "   ")).toThrow(ValidationError);
  });
});
