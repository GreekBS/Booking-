import type {
  HousekeepingTodayBoard,
  HousekeepingTodayTaskBrief,
  HousekeepingTodayUnitRow,
  IHousekeepingTodayQuery,
} from "@hcp/domain";
import { TimezoneService } from "../../adapters/TimezoneService";
import { withTenantTransaction } from "../../client";

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toTaskBrief(row: {
  id: string;
  title: string;
  status: string;
  priority: string;
  source: string;
  sourceKey: string | null;
  bookingId: string | null;
  assignedToUserId: string | null;
  dueAt: Date | null;
  version: number;
}): HousekeepingTodayTaskBrief {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    source: row.source,
    sourceKey: row.sourceKey,
    bookingId: row.bookingId,
    assignedToUserId: row.assignedToUserId,
    dueAt: row.dueAt?.toISOString() ?? null,
    version: row.version,
  };
}

export class PrismaHousekeepingTodayQuery implements IHousekeepingTodayQuery {
  private readonly timezone = new TimezoneService();

  async getTodayBoard(input: {
    tenantId: string;
    propertyId: string;
  }): Promise<HousekeepingTodayBoard | null> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const property = await tx.property.findFirst({
        where: {
          id: input.propertyId,
          tenantId: input.tenantId,
          deletedAt: null,
        },
        select: { id: true, name: true, timezone: true },
      });
      if (!property) return null;

      const localToday = await this.timezone.propertyLocalToday(
        property.timezone || "Europe/Athens",
      );
      const todayDate = new Date(`${localToday}T00:00:00.000Z`);

      const [units, hkRows, dayBookings, openHkTasks, overdueRows] =
        await Promise.all([
          tx.unit.findMany({
            where: {
              tenantId: input.tenantId,
              propertyId: input.propertyId,
              deletedAt: null,
              status: { not: "archived" },
            },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          tx.unitHousekeepingStatus.findMany({
            where: {
              tenantId: input.tenantId,
              propertyId: input.propertyId,
            },
          }),
          tx.booking.findMany({
            where: {
              tenantId: input.tenantId,
              propertyId: input.propertyId,
              status: "confirmed",
              OR: [{ checkOut: todayDate }, { checkIn: todayDate }],
            },
            select: {
              id: true,
              unitId: true,
              guestName: true,
              guestId: true,
              checkIn: true,
              checkOut: true,
            },
          }),
          tx.task.findMany({
            where: {
              tenantId: input.tenantId,
              propertyId: input.propertyId,
              category: "HOUSEKEEPING",
              status: { in: ["OPEN", "IN_PROGRESS"] },
            },
            orderBy: [{ status: "desc" }, { dueAt: "asc" }],
          }),
          tx.task.findMany({
            where: {
              tenantId: input.tenantId,
              propertyId: input.propertyId,
              status: { in: ["OPEN", "IN_PROGRESS"] },
              dueAt: { lt: todayDate },
            },
            orderBy: { dueAt: "asc" },
            take: 50,
          }),
        ]);

      const hkByUnit = new Map(hkRows.map((r) => [r.unitId, r]));
      // Prefer IN_PROGRESS over OPEN when multiple HK tasks per unit
      const taskByUnit = new Map<string, (typeof openHkTasks)[number]>();
      for (const t of openHkTasks) {
        if (!t.unitId) continue;
        const existing = taskByUnit.get(t.unitId);
        if (!existing || (existing.status === "OPEN" && t.status === "IN_PROGRESS")) {
          taskByUnit.set(t.unitId, t);
        }
      }

      const departingByUnit = new Map<string, (typeof dayBookings)[number]>();
      const arrivingByUnit = new Map<string, (typeof dayBookings)[number]>();
      for (const b of dayBookings) {
        if (formatDate(b.checkOut) === localToday) {
          departingByUnit.set(b.unitId, b);
        }
        if (formatDate(b.checkIn) === localToday) {
          arrivingByUnit.set(b.unitId, b);
        }
      }

      const unitRows: HousekeepingTodayUnitRow[] = units.map((u) => {
        const hk = hkByUnit.get(u.id);
        const status = (hk?.status as "CLEAN" | "DIRTY") ?? "CLEAN";
        const arriving = arrivingByUnit.get(u.id) ?? null;
        const departing = departingByUnit.get(u.id) ?? null;
        const task = taskByUnit.get(u.id) ?? null;
        const readyForArrival = Boolean(arriving) && status === "CLEAN";
        const arrivalNeedsClean = Boolean(arriving) && status === "DIRTY";

        return {
          unitId: u.id,
          unitName: u.name,
          housekeepingStatus: status,
          housekeepingVersion: hk?.version ?? 1,
          housekeepingSource: hk?.source ?? "INIT",
          departing: departing
            ? {
                bookingId: departing.id,
                guestName: departing.guestName,
                checkIn: formatDate(departing.checkIn),
                checkOut: formatDate(departing.checkOut),
                guestId: departing.guestId,
              }
            : null,
          arriving: arriving
            ? {
                bookingId: arriving.id,
                guestName: arriving.guestName,
                checkIn: formatDate(arriving.checkIn),
                checkOut: formatDate(arriving.checkOut),
                guestId: arriving.guestId,
              }
            : null,
          housekeepingTask: task ? toTaskBrief(task) : null,
          readyForArrival,
          arrivalNeedsClean,
        };
      });

      const summary = {
        departuresToday: unitRows.filter((r) => r.departing).length,
        dirty: unitRows.filter((r) => r.housekeepingStatus === "DIRTY").length,
        inProgress: unitRows.filter(
          (r) => r.housekeepingTask?.status === "IN_PROGRESS",
        ).length,
        readyForArrivals: unitRows.filter((r) => r.readyForArrival).length,
        overdueTasks: overdueRows.length,
      };

      return {
        propertyId: property.id,
        propertyName: property.name,
        propertyTimezone: property.timezone || "Europe/Athens",
        localToday,
        summary,
        units: unitRows,
        overdueTasks: overdueRows.map(toTaskBrief),
      };
    });
  }
}
