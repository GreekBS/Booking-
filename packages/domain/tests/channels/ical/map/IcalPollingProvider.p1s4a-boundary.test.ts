import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { IcalPollingProvider, mayEmitReservationCreate } from "../../../../src/channels";
import { createMockIcalFeedFetcher } from "../helpers/mockIcalFeedFetcher";
import { encodeIcsCalendar } from "../helpers/encodeIcsCalendar";

const DOMAIN_ROOT = join(__dirname, "..", "..", "..", "..", "src", "channels");
const MAP_ROOT = join(DOMAIN_ROOT, "providers", "ical", "map");

describe("IcalPollingProvider P1-S5 map activation boundary", () => {
  it("poll path uses mapIcalCalendar while map/ module stays isolated", () => {
    const pollSource = readFileSync(
      join(DOMAIN_ROOT, "providers", "ical", "IcalPollingProvider.ts"),
      "utf8",
    );
    expect(pollSource).toMatch(/mapIcalCalendar/);

    const mapSource = readFileSync(join(MAP_ROOT, "mapIcalCalendar.ts"), "utf8");
    const importLines = mapSource.split("\n").filter((line) => line.startsWith("import "));
    for (const line of importLines) {
      expect(line).not.toMatch(
        /ChannelProviderMessage|ReceiveChannel|ProcessChannel|IChannelPollCursor|Inbox|@hcp\/database|prisma|Booking|Commerce/,
      );
    }
  });

  it("registration factory does not reference the mapper directly", () => {
    const source = readFileSync(
      join(DOMAIN_ROOT, "providers", "ical", "createIcalProviderRegistration.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/mapIcalCalendar|buildIcalSnapshotIndex|encodeIcalCursor/);
  });

  it("poll executes fetch → parse → map → ingress build", async () => {
    const body = encodeIcsCalendar([{ uid: "a@x", dtstart: "20260101", dtend: "20260102" }]);
    const provider = new IcalPollingProvider(createMockIcalFeedFetcher(() => body));
    const result = await provider.poll("conn-1", null, {
      credentialMaterial: { feedUrl: "https://example.test/feed.ics" },
    });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.kind).toBe("reservation.unknown");
    expect(result.nextCursor).not.toBeNull();
  });

  it("keeps mayEmitReservationCreate false", () => {
    expect(
      mayEmitReservationCreate({
        semanticMode: "reservation_feed",
        semanticConfigVersion: 1,
      }),
    ).toBe(false);
  });
});
