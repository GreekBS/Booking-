import { describe, expect, it } from "vitest";
import {
  assignConflictGroupIds,
  emptyConflictSnapshot,
  parseConflictSnapshot,
  type ReservationImportConflictNode,
} from "../../src/commerce/import/ReservationImportConflictGraph";

describe("ReservationImportConflictGraph", () => {
  it("assigns shared group ids to connected overlapping nodes", () => {
    const nodes: ReservationImportConflictNode[] = [
      {
        kind: "import_row",
        id: "r1",
        unitId: "u1",
        checkIn: "2026-07-01",
        checkOut: "2026-07-05",
      },
      {
        kind: "existing_booking",
        id: "b1",
        unitId: "u1",
        checkIn: "2026-07-03",
        checkOut: "2026-07-07",
      },
      {
        kind: "existing_booking",
        id: "b2",
        unitId: "u1",
        checkIn: "2026-07-06",
        checkOut: "2026-07-10",
      },
      {
        kind: "import_row",
        id: "r2",
        unitId: "u1",
        checkIn: "2026-08-01",
        checkOut: "2026-08-03",
      },
    ];

    const groups = assignConflictGroupIds(nodes);
    expect(groups.get("import_row:r1")).toBeTruthy();
    expect(groups.get("existing_booking:b1")).toBe(groups.get("import_row:r1"));
    expect(groups.get("existing_booking:b2")).toBe(groups.get("import_row:r1"));
    expect(groups.has("import_row:r2")).toBe(false);
  });

  it("parses empty and versioned conflict snapshots", () => {
    expect(parseConflictSnapshot(null)).toEqual(emptyConflictSnapshot());
    expect(parseConflictSnapshot({ version: 2 })).toEqual(emptyConflictSnapshot());
    const snap = parseConflictSnapshot({
      version: 1,
      existingBookingIds: ["a", 1, "b"],
      peerImportRowIds: ["r1"],
      nonBookingBlockers: [],
      overlaps: [],
    });
    expect(snap.existingBookingIds).toEqual(["a", "b"]);
    expect(snap.peerImportRowIds).toEqual(["r1"]);
  });
});
