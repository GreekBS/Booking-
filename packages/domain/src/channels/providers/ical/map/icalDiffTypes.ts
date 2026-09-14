import type { IcalDigestGroup, IcalSnapshotGroup } from "./icalMapTypes";

export type IcalSnapshotGroupChange =
  | {
      readonly change: "added";
      readonly identityKey: string;
      readonly current: IcalSnapshotGroup;
    }
  | {
      readonly change: "removed";
      readonly identityKey: string;
      readonly previous: IcalDigestGroup;
    }
  | {
      readonly change: "updated";
      readonly identityKey: string;
      readonly previous: IcalDigestGroup;
      readonly current: IcalSnapshotGroup;
    }
  | {
      readonly change: "unchanged";
      readonly identityKey: string;
      readonly previous: IcalDigestGroup;
      readonly current: IcalSnapshotGroup;
    };

export interface IcalSnapshotDiff {
  readonly previousSnapshotHash: string | null;
  readonly currentSnapshotHash: string;
  readonly changes: readonly IcalSnapshotGroupChange[];
  readonly addedCount: number;
  readonly updatedCount: number;
  readonly removedCount: number;
  readonly unchangedCount: number;
}
