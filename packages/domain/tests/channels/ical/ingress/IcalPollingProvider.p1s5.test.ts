import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IcalPollingProvider } from "../../../../src/channels/providers/ical/IcalPollingProvider";
import { createMockIcalFeedFetcher } from "../helpers/mockIcalFeedFetcher";
import { encodeIcsCalendar } from "../helpers/encodeIcsCalendar";

describe("IcalPollingProvider P1-S5 poll path", () => {
  it("first poll returns trusted ingress messages and proposed cursor", async () => {
    const body = encodeIcsCalendar([{ uid: "first@x", dtstart: "20260101", dtend: "20260102" }]);
    const provider = new IcalPollingProvider(createMockIcalFeedFetcher(() => body));
    const trusted = await provider.pollTrustedIngress("conn-1", null, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    expect(trusted.items).toHaveLength(1);
    expect(trusted.items[0]!.message.kind).toBe("reservation.unknown");
    expect(trusted.nextCursor.trim().length).toBeGreaterThan(0);
    expect(trusted.evidenceRecordCount).toBe(1);
  });

  it("unchanged feed returns zero records but non-null cursor", async () => {
    const body = encodeIcsCalendar([{ uid: "stable@x", dtstart: "20260101", dtend: "20260102" }]);
    const provider = new IcalPollingProvider(createMockIcalFeedFetcher(() => body));
    const first = await provider.pollTrustedIngress("conn-1", null, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    const second = await provider.pollTrustedIngress("conn-1", first.nextCursor, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    expect(second.items).toHaveLength(0);
    expect(second.nextCursor).not.toBeNull();
    expect(second.nextCursor.trim().length).toBeGreaterThan(0);
  });

  it("empty first feed creates baseline cursor", async () => {
    const body = encodeIcsCalendar([]);
    const provider = new IcalPollingProvider(createMockIcalFeedFetcher(() => body));
    const result = await provider.pollTrustedIngress("conn-1", null, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor.trim().length).toBeGreaterThan(0);
  });

  it("invalid cursor with empty feed still proposes baseline cursor", async () => {
    const body = encodeIcsCalendar([]);
    const provider = new IcalPollingProvider(createMockIcalFeedFetcher(() => body));
    const result = await provider.pollTrustedIngress("conn-1", "{bad", {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    expect(result.mapIssueCodes).toContain("CURSOR_INVALID");
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor.trim().length).toBeGreaterThan(0);
  });

  it("unsupported cursor version with empty feed reports issue and proposes cursor", async () => {
    const body = encodeIcsCalendar([{ uid: "a@x", dtstart: "20260101", dtend: "20260102" }]);
    const provider = new IcalPollingProvider(createMockIcalFeedFetcher(() => body));
    const first = await provider.pollTrustedIngress("conn-1", null, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    const unsupported = first.nextCursor.replace('"v":1', '"v":2');
    const second = await provider.pollTrustedIngress("conn-1", unsupported, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    expect(second.mapIssueCodes).toContain("CURSOR_UNSUPPORTED_VERSION");
    expect(second.nextCursor.trim().length).toBeGreaterThan(0);
  });

  it("does not persist cursor inside provider", async () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src",
        "channels",
        "providers",
        "ical",
        "IcalPollingProvider.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/advanceCursor|IChannelPollCursor|cursorRepository/);
  });

  it("requires feedUrl credential material", async () => {
    const provider = new IcalPollingProvider(createMockIcalFeedFetcher(() => encodeIcsCalendar([])));
    await expect(provider.pollTrustedIngress("conn-1", null, {})).rejects.toMatchObject({
      name: "ValidationError",
    });
  });
});
