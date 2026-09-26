import type { Task } from "../domain/Task";
import type { UnitHousekeepingStatusValue } from "../domain/TaskTypes";

export interface HousekeepingTodayBookingBrief {
  bookingId: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  guestId: string | null;
}

export interface HousekeepingTodayTaskBrief {
  id: string;
  title: string;
  status: string;
  priority: string;
  source: string;
  sourceKey: string | null;
  bookingId: string | null;
  assignedToUserId: string | null;
  dueAt: string | null;
  version: number;
}

export interface HousekeepingTodayUnitRow {
  unitId: string;
  unitName: string;
  housekeepingStatus: UnitHousekeepingStatusValue;
  housekeepingVersion: number;
  housekeepingSource: string;
  departing: HousekeepingTodayBookingBrief | null;
  arriving: HousekeepingTodayBookingBrief | null;
  housekeepingTask: HousekeepingTodayTaskBrief | null;
  /** Derived: arrival today + CLEAN. Not persisted. */
  readyForArrival: boolean;
  /** Arrival today while DIRTY — needs attention. */
  arrivalNeedsClean: boolean;
}

export interface HousekeepingTodaySummary {
  departuresToday: number;
  dirty: number;
  inProgress: number;
  readyForArrivals: number;
  overdueTasks: number;
}

export interface HousekeepingTodayBoard {
  propertyId: string;
  propertyName: string;
  propertyTimezone: string;
  localToday: string;
  summary: HousekeepingTodaySummary;
  units: HousekeepingTodayUnitRow[];
  overdueTasks: HousekeepingTodayTaskBrief[];
}

export interface IHousekeepingTodayQuery {
  getTodayBoard(input: {
    tenantId: string;
    propertyId: string;
  }): Promise<HousekeepingTodayBoard | null>;
}
