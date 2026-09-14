import { describe, expect, it } from "vitest";
import {
  buildIcalSnapshotIndex,
  diffIcalSnapshotIndexes,
  toIcalDigestIndex,
} from "../../../../src/channels";
import { dateValue, makeCalendar, makeEvent } from "./helpers";

describe("IcalSnapshotDiff P1-S4b", () => {
  it("previous null → all current groups added", () => {
    const current = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, uid: "a@x" }),
        makeEvent({ eventIndex: 1, uid: "b@x" }),
      ]),
    );
    const diff = diffIcalSnapshotIndexes(null, current);
    expect(diff.addedCount).toBe(2);
    expect(diff.removedCount).toBe(0);
    expect(diff.updatedCount).toBe(0);
    expect(diff.unchangedCount).toBe(0);
    expect(diff.changes.every((c) => c.change === "added")).toBe(true);
  });

  it("absent previous group → removed", () => {
    const previous = toIcalDigestIndex(
      buildIcalSnapshotIndex(makeCalendar([makeEvent({ eventIndex: 0, uid: "gone@x" })])),
    );
    const current = buildIcalSnapshotIndex(makeCalendar([]));
    const diff = diffIcalSnapshotIndexes(previous, current);
    expect(diff.removedCount).toBe(1);
    expect(diff.changes[0]).toMatchObject({ change: "removed", identityKey: previous.groups[0]!.identityKey });
  });

  it("new current group → added", () => {
    const previous = toIcalDigestIndex(buildIcalSnapshotIndex(makeCalendar([])));
    const current = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid: "new@x" })]),
    );
    const diff = diffIcalSnapshotIndexes(previous, current);
    expect(diff.addedCount).toBe(1);
  });

  it("same hash multiset → unchanged", () => {
    const event = makeEvent({ eventIndex: 0, uid: "stable@x", sequence: 1 });
    const previous = toIcalDigestIndex(buildIcalSnapshotIndex(makeCalendar([event])));
    const current = buildIcalSnapshotIndex(makeCalendar([event]));
    const diff = diffIcalSnapshotIndexes(previous, current);
    expect(diff.unchangedCount).toBe(1);
    expect(diff.changes[0]!.change).toBe("unchanged");
  });

  it("changed one hash → updated", () => {
    const previous = toIcalDigestIndex(
      buildIcalSnapshotIndex(
        makeCalendar([makeEvent({ eventIndex: 0, uid: "u@x", sequence: 0 })]),
      ),
    );
    const current = buildIcalSnapshotIndex(
      makeCalendar([makeEvent({ eventIndex: 0, uid: "u@x", sequence: 1 })]),
    );
    const diff = diffIcalSnapshotIndexes(previous, current);
    expect(diff.updatedCount).toBe(1);
    expect(diff.changes[0]!.change).toBe("updated");
  });

  it("duplicate hash multiplicity increase [a] → [a,a] → updated", () => {
    const twin = makeEvent({
      eventIndex: 0,
      uid: null,
      dtstart: dateValue("20260101"),
      dtend: dateValue("20260102"),
      sequence: 0,
    });
    const previous = toIcalDigestIndex(
      buildIcalSnapshotIndex(makeCalendar([twin])),
    );
    const current = buildIcalSnapshotIndex(
      makeCalendar([
        twin,
        { ...twin, eventIndex: 1, componentIndex: 1 },
      ]),
    );
    const diff = diffIcalSnapshotIndexes(previous, current);
    expect(diff.updatedCount).toBe(1);
    expect(diff.changes[0]!.change).toBe("updated");
  });

  it("duplicate hash multiplicity decrease [a,a] → [a] → updated", () => {
    const twin = makeEvent({
      eventIndex: 0,
      uid: null,
      dtstart: dateValue("20260101"),
      dtend: dateValue("20260102"),
      sequence: 0,
    });
    const previous = toIcalDigestIndex(
      buildIcalSnapshotIndex(
        makeCalendar([twin, { ...twin, eventIndex: 1, componentIndex: 1 }]),
      ),
    );
    const current = buildIcalSnapshotIndex(makeCalendar([twin]));
    const diff = diffIcalSnapshotIndexes(previous, current);
    expect(diff.updatedCount).toBe(1);
    expect(diff.removedCount).toBe(0);
    expect(diff.changes[0]!.change).toBe("updated");
    const previousHashes = previous.groups[0]!.entryContentHashes;
    const currentHashes = current.groups[0]!.entryContentHashes;
    expect(previousHashes).toHaveLength(2);
    expect(currentHashes).toHaveLength(1);
    expect(previousHashes[0]).toBe(currentHashes[0]);
  });

  it("VEVENT source reorder does not create updates", () => {
    const a = makeEvent({ eventIndex: 0, uid: "a@x" });
    const b = makeEvent({ eventIndex: 1, uid: "b@x" });
    const previous = toIcalDigestIndex(buildIcalSnapshotIndex(makeCalendar([a, b])));
    const current = buildIcalSnapshotIndex(
      makeCalendar([
        { ...b, eventIndex: 0, componentIndex: 0 },
        { ...a, eventIndex: 1, componentIndex: 1 },
      ]),
    );
    const diff = diffIcalSnapshotIndexes(previous, current);
    expect(diff.updatedCount).toBe(0);
    expect(diff.unchangedCount).toBe(2);
  });

  it("same snapshot hash short-circuits to unchanged semantics", () => {
    const events = [makeEvent({ eventIndex: 0, uid: "a@x" }), makeEvent({ eventIndex: 1, uid: "b@x" })];
    const snap = buildIcalSnapshotIndex(makeCalendar(events));
    const previous = toIcalDigestIndex(snap);
    const current = buildIcalSnapshotIndex(
      makeCalendar([
        { ...events[1]!, eventIndex: 0, componentIndex: 0 },
        { ...events[0]!, eventIndex: 1, componentIndex: 1 },
      ]),
    );
    expect(current.snapshotHash).toBe(previous.snapshotHash);
    const diff = diffIcalSnapshotIndexes(previous, current);
    expect(diff.unchangedCount).toBe(2);
    expect(diff.addedCount).toBe(0);
    expect(diff.removedCount).toBe(0);
    expect(diff.updatedCount).toBe(0);
  });

  it("orders changes by identityKey", () => {
    const current = buildIcalSnapshotIndex(
      makeCalendar([
        makeEvent({ eventIndex: 0, uid: "z@x" }),
        makeEvent({ eventIndex: 1, uid: "a@x" }),
      ]),
    );
    const diff = diffIcalSnapshotIndexes(null, current);
    const keys = diff.changes.map((c) => c.identityKey);
    expect(keys).toEqual([...keys].sort());
  });
});
