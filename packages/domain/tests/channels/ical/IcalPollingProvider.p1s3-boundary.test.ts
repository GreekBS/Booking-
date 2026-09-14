import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IcalPollingProvider } from "../../../src/channels";
import { createMockIcalFeedFetcher } from "./helpers/mockIcalFeedFetcher";
import { encodeIcsCalendar } from "./helpers/encodeIcsCalendar";
import { createTestIcalProviderRegistration } from "./helpers/icalTestProvider";

const DOMAIN_ROOT = join(__dirname, "..", "..", "..", "src", "channels");

describe("IcalPollingProvider P1-S5 parser boundary", () => {
  it("poll path imports and uses parseIcalCalendar (P1-S5)", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "providers", "ical", "IcalPollingProvider.ts"),
      "utf8",
    );
    expect(source).toMatch(/parseIcalCalendar/);
  });

  it("registration factory does not reference the parser directly", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "providers", "ical", "createIcalProviderRegistration.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/parseIcalCalendar|providers\/ical\/parse/);
  });

  it("poll fetches and parses when feedUrl and fetcher are provided", async () => {
    const body = encodeIcsCalendar([{ uid: "evt@x", dtstart: "20260101", dtend: "20260102" }]);
    const provider = new IcalPollingProvider(createMockIcalFeedFetcher(() => body));
    const registration = createTestIcalProviderRegistration(() => body);
    expect(registration.polling).toBeInstanceOf(IcalPollingProvider);

    const result = await provider.poll("conn-1", null, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.nextCursor).not.toBeNull();
  });
});
