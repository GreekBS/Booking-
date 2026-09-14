import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapIcalCalendar, mayEmitReservationCreate } from "../../../../src/channels";

const DOMAIN_ROOT = join(__dirname, "..", "..", "..", "..", "src", "channels");
const MAP_ROOT = join(DOMAIN_ROOT, "providers", "ical", "map");
const INGRESS_ROOT = join(DOMAIN_ROOT, "providers", "ical", "ingress");

describe("IcalPollingProvider P1-S5 S4b purity boundary", () => {
  it("map module does not import ChannelProviderMessage or Inbox", () => {
    const files = [
      "mapIcalCalendar.ts",
      "classifyIcalSnapshotDiff.ts",
      "diffIcalSnapshotIndexes.ts",
      "icalClassification.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(MAP_ROOT, file), "utf8");
      const importLines = source.split("\n").filter((line) => line.startsWith("import "));
      for (const line of importLines) {
        expect(line).not.toMatch(
          /ChannelProviderMessage|ReceiveChannel|ProcessChannel|IChannelPollCursor|Inbox|@hcp\/database|prisma|Booking|Commerce/,
        );
      }
    }
  });

  it("ingress layer does not import Booking/Commerce/inventory", () => {
    const files = [
      "buildIcalInboundIngressItems.ts",
      "icalIngressIdentityCodec.ts",
      "IIcalTrustedIngressPollingProvider.ts",
    ];
    for (const file of files) {
      const source = readFileSync(join(INGRESS_ROOT, file), "utf8");
      const importLines = source.split("\n").filter((line) => line.startsWith("import "));
      for (const line of importLines) {
        expect(line).not.toMatch(/Booking|Commerce|UnitCalendarBlock|inventory/);
      }
    }
  });

  it("mapIcalCalendar remains callable and pure", () => {
    expect(typeof mapIcalCalendar).toBe("function");
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
