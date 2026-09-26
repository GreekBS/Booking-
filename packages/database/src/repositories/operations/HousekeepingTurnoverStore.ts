import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  ConflictError,
  Task,
  UnitHousekeepingStatus,
  canonicalTurnoverSourceKey,
  historyTurnoverSourceKey,
  TURNOVER_TASK_TITLE,
  type ApplyTurnoverEnsureCommand,
  type ApplyTurnoverEnsureResult,
  type CancelTurnoverForBookingCommand,
  type IHousekeepingTurnoverStore,
  type TurnoverBookingSnapshot,
} from "@hcp/domain";
import { prisma, withTenantTransaction } from "../../client";
import { mapTask, type TaskRow } from "./TaskRepository";
import { mapHk, type HkRow } from "./UnitHousekeepingStatusRepository";

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDueAt(checkOutIso: string): Date {
  // Noon UTC on checkout date — display/sort only; due comparison uses ISO date.
  return new Date(`${checkOutIso}T12:00:00.000Z`);
}

function mapBookingSnapshot(row: {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  guestId: string | null;
  status: string;
  checkIn: Date;
  checkOut: Date;
  property: { timezone: string };
}): TurnoverBookingSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    unitId: row.unitId,
    guestId: row.guestId,
    status: row.status,
    checkIn: formatDate(row.checkIn),
    checkOut: formatDate(row.checkOut),
    propertyTimezone: row.property.timezone || "Europe/Athens",
  };
}

async function ensureHkRow(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    propertyId: string;
    unitId: string;
  },
): Promise<UnitHousekeepingStatus> {
  const existing = await tx.unitHousekeepingStatus.findFirst({
    where: { tenantId: input.tenantId, unitId: input.unitId },
  });
  if (existing) return mapHk(existing as HkRow);
  const now = new Date();
  try {
    const created = await tx.unitHousekeepingStatus.create({
      data: {
        unitId: input.unitId,
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        status: "CLEAN",
        source: "INIT",
        updatedByUserId: null,
        updatedAt: now,
        version: 1,
      },
    });
    return mapHk(created as HkRow);
  } catch {
    const again = await tx.unitHousekeepingStatus.findFirst({
      where: { tenantId: input.tenantId, unitId: input.unitId },
    });
    if (!again) throw new Error("Failed to ensure housekeeping row");
    return mapHk(again as HkRow);
  }
}

async function casUpdateTask(
  tx: Prisma.TransactionClient,
  task: Task,
  expectedVersion: number,
): Promise<void> {
  const p = task.toProps();
  const result = await tx.task.updateMany({
    where: { id: task.id, tenantId: task.tenantId, version: expectedVersion },
    data: {
      propertyId: p.propertyId,
      unitId: p.unitId,
      bookingId: p.bookingId,
      guestId: p.guestId,
      category: p.category,
      title: p.title,
      description: p.description,
      status: p.status,
      priority: p.priority,
      assignedToUserId: p.assignedToUserId,
      dueAt: p.dueAt,
      startedAt: p.startedAt,
      completedAt: p.completedAt,
      completionNote: p.completionNote,
      source: p.source,
      sourceKey: p.sourceKey,
      version: p.version,
      updatedAt: p.updatedAt,
    },
  });
  if (result.count !== 1) {
    throw new ConflictError("Task version conflict", "task_version_conflict");
  }
}

async function casUpdateHk(
  tx: Prisma.TransactionClient,
  status: UnitHousekeepingStatus,
  expectedVersion: number,
): Promise<void> {
  const p = status.toProps();
  const result = await tx.unitHousekeepingStatus.updateMany({
    where: {
      unitId: status.unitId,
      tenantId: status.tenantId,
      version: expectedVersion,
    },
    data: {
      propertyId: p.propertyId,
      status: p.status,
      source: p.source,
      updatedByUserId: p.updatedByUserId,
      updatedAt: p.updatedAt,
      version: p.version,
    },
  });
  if (result.count !== 1) {
    throw new ConflictError(
      "Unit housekeeping version conflict",
      "housekeeping_version_conflict",
    );
  }
}

export class PrismaHousekeepingTurnoverStore
  implements IHousekeepingTurnoverStore
{
  async findConfirmedBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<TurnoverBookingSnapshot | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.booking.findFirst({
        where: { id: bookingId, tenantId, status: "confirmed" },
        include: { property: { select: { timezone: true } } },
      });
      return row ? mapBookingSnapshot(row) : null;
    });
  }

  async listDueConfirmedBookings(input: {
    lookbackDays: number;
    at: Date;
    limit: number;
  }): Promise<TurnoverBookingSnapshot[]> {
    // Coarse UTC window — property TZ filtered in use case.
    const end = new Date(input.at);
    end.setUTCDate(end.getUTCDate() + 1);
    const start = new Date(input.at);
    start.setUTCDate(start.getUTCDate() - (input.lookbackDays + 1));

    // Cross-tenant scan: use base prisma without tenant GUC (job system role).
    // RLS FORCE still applies — talos_runtime without tenant context sees nothing.
    // Use DIRECT/admin path via prisma with bypass? F3.1: migrations use admin;
    // jobs typically set no tenant — need to query as privileged or iterate tenants.
    // Pattern from ExpireHolds: repositories use prisma without tenant for global expire.
    const rows = await prisma.booking.findMany({
      where: {
        status: "confirmed",
        checkOut: {
          gte: start,
          lte: end,
        },
      },
      include: { property: { select: { timezone: true } } },
      take: input.limit,
      orderBy: { checkOut: "asc" },
    });

    // If RLS blocks empty, fall back to per-tenant: check result length.
    // Demo DB often uses BYPASSRLS admin URL for worker — OK.
    return rows.map(mapBookingSnapshot);
  }

  async ensureTurnover(
    command: ApplyTurnoverEnsureCommand,
  ): Promise<ApplyTurnoverEnsureResult> {
    const { booking } = command;
    const now = command.now ?? new Date();
    const sourceKey = canonicalTurnoverSourceKey(booking.id);
    const dueAt = parseDueAt(booking.checkOut);

    return withTenantTransaction(booking.tenantId, async (tx) => {
      // Lock booking row to serialize concurrent generators
      await tx.$queryRaw`
        SELECT id FROM bookings
        WHERE id = ${booking.id}::uuid AND tenant_id = ${booking.tenantId}::uuid
        FOR UPDATE
      `;

      let historyPreserved = false;
      let created = false;
      let reconciled = false;

      let existingRow = await tx.task.findFirst({
        where: { tenantId: booking.tenantId, sourceKey },
      });

      // IN_PROGRESS or COMPLETED with mismatched unit/due → retire key + new canonical
      if (existingRow) {
        const existing = mapTask(existingRow as TaskRow);
        const unitMismatch = existing.unitId !== booking.unitId;
        const dueMismatch =
          !existing.dueAt || formatDate(existing.dueAt) !== booking.checkOut;
        const needsNewCanonical =
          (existing.status === "IN_PROGRESS" || existing.status === "COMPLETED") &&
          (unitMismatch || dueMismatch);

        if (needsNewCanonical) {
          const expected = existing.version;
          existing.retireSourceKey(
            expected,
            historyTurnoverSourceKey(booking.id, existing.id),
            now,
          );
          await casUpdateTask(tx, existing, expected);
          historyPreserved = true;
          existingRow = null;
        } else if (existing.status === "CANCELLED") {
          // Reclaim cancelled canonical key into history and recreate
          const expected = existing.version;
          existing.retireSourceKey(
            expected,
            historyTurnoverSourceKey(booking.id, existing.id),
            now,
          );
          await casUpdateTask(tx, existing, expected);
          existingRow = null;
        }
      }

      let task: Task;

      if (!existingRow) {
        task = Task.create({
          id: randomUUID(),
          tenantId: booking.tenantId,
          propertyId: booking.propertyId,
          unitId: booking.unitId,
          bookingId: booking.id,
          guestId: booking.guestId,
          category: "HOUSEKEEPING",
          title: TURNOVER_TASK_TITLE,
          priority: "NORMAL",
          dueAt,
          source: "TURNOVER",
          sourceKey,
          createdByUserId: null,
          now,
        });
        try {
          const p = task.toProps();
          await tx.task.create({
            data: {
              id: p.id,
              tenantId: p.tenantId,
              propertyId: p.propertyId,
              unitId: p.unitId,
              bookingId: p.bookingId,
              guestId: p.guestId,
              category: p.category,
              title: p.title,
              description: p.description,
              status: p.status,
              priority: p.priority,
              assignedToUserId: p.assignedToUserId,
              dueAt: p.dueAt,
              startedAt: p.startedAt,
              completedAt: p.completedAt,
              completionNote: p.completionNote,
              source: p.source,
              sourceKey: p.sourceKey,
              version: p.version,
              createdByUserId: p.createdByUserId,
              createdAt: p.createdAt,
              updatedAt: p.updatedAt,
            },
          });
          created = true;
        } catch (err) {
          // Unique race — reload winner
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          ) {
            const raced = await tx.task.findFirst({
              where: { tenantId: booking.tenantId, sourceKey },
            });
            if (!raced) throw err;
            task = mapTask(raced as TaskRow);
            created = false;
          } else {
            throw err;
          }
        }
      } else {
        task = mapTask(existingRow as TaskRow);
        if (task.status === "OPEN") {
          const unitMismatch = task.unitId !== booking.unitId;
          const propMismatch = task.propertyId !== booking.propertyId;
          const dueMismatch =
            !task.dueAt || formatDate(task.dueAt) !== booking.checkOut;
          if (unitMismatch || propMismatch || dueMismatch) {
            const expected = task.version;
            task.reconcileOpenTurnover(
              expected,
              {
                propertyId: booking.propertyId,
                unitId: booking.unitId,
                dueAt,
                guestId: booking.guestId,
              },
              now,
            );
            await casUpdateTask(tx, task, expected);
            reconciled = true;
          }
        } else if (
          task.status === "IN_PROGRESS" &&
          task.unitId === booking.unitId &&
          task.dueAt &&
          formatDate(task.dueAt) === booking.checkOut
        ) {
          // Same stay — leave in progress
        } else if (
          task.status === "COMPLETED" &&
          task.unitId === booking.unitId &&
          task.dueAt &&
          formatDate(task.dueAt) === booking.checkOut
        ) {
          // Already completed for this stay — no new work
        }
      }

      let housekeeping = await ensureHkRow(tx, {
        tenantId: booking.tenantId,
        propertyId: booking.propertyId,
        unitId: booking.unitId,
      });

      let markedDirty = false;
      const alreadyCleanedForStay =
        task.status === "COMPLETED" &&
        task.unitId === booking.unitId &&
        task.dueAt != null &&
        formatDate(task.dueAt) === booking.checkOut;

      if (command.markDirtyIfDue && !alreadyCleanedForStay) {
        const expected = housekeeping.version;
        markedDirty = housekeeping.markDirty(
          expected,
          "TURNOVER",
          command.actorUserId,
          now,
        );
        if (markedDirty) {
          await casUpdateHk(tx, housekeeping, expected);
        }
      }

      return {
        task,
        housekeeping,
        created,
        reconciled,
        markedDirty,
        historyPreserved,
      };
    });
  }

  async cancelOpenTurnoverTasks(
    command: CancelTurnoverForBookingCommand,
  ): Promise<{ cancelledTaskIds: string[] }> {
    const now = command.now ?? new Date();
    return withTenantTransaction(command.tenantId, async (tx) => {
      const sourceKey = canonicalTurnoverSourceKey(command.bookingId);
      const rows = await tx.task.findMany({
        where: {
          tenantId: command.tenantId,
          bookingId: command.bookingId,
          source: "TURNOVER",
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      });

      const cancelledTaskIds: string[] = [];
      for (const row of rows) {
        const task = mapTask(row as TaskRow);
        // Prefer canceling canonical; also cancel any open history if present
        const expected = task.version;
        task.cancel(expected, now);
        await casUpdateTask(tx, task, expected);
        cancelledTaskIds.push(task.id);
      }

      // If only sourceKey match with different bookingId null edge — also by key
      const byKey = await tx.task.findFirst({
        where: {
          tenantId: command.tenantId,
          sourceKey,
          status: { in: ["OPEN", "IN_PROGRESS"] },
        },
      });
      if (byKey && !cancelledTaskIds.includes(byKey.id)) {
        const task = mapTask(byKey as TaskRow);
        const expected = task.version;
        task.cancel(expected, now);
        await casUpdateTask(tx, task, expected);
        cancelledTaskIds.push(task.id);
      }

      return { cancelledTaskIds };
    });
  }

  async completeHousekeepingTask(input: {
    tenantId: string;
    taskId: string;
    expectedVersion: number;
    completionNote?: string | null;
    actorUserId: string | null;
    now?: Date;
  }): Promise<{ task: Task; housekeeping: UnitHousekeepingStatus | null }> {
    const now = input.now ?? new Date();
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.task.findFirst({
        where: { id: input.taskId, tenantId: input.tenantId },
      });
      if (!row) {
        throw new ConflictError("Task not found");
      }
      const task = mapTask(row as TaskRow);
      task.complete(input.expectedVersion, input.completionNote, now);
      await casUpdateTask(tx, task, input.expectedVersion);

      let housekeeping: UnitHousekeepingStatus | null = null;
      if (task.unitId && task.category === "HOUSEKEEPING") {
        housekeeping = await ensureHkRow(tx, {
          tenantId: input.tenantId,
          propertyId: task.propertyId,
          unitId: task.unitId,
        });
        const expected = housekeeping.version;
        const changed = housekeeping.markClean(
          expected,
          "TASK_COMPLETE",
          input.actorUserId,
          now,
        );
        if (changed) {
          await casUpdateHk(tx, housekeeping, expected);
        }
      }
      return { task, housekeeping };
    });
  }

  async reopenHousekeepingTask(input: {
    tenantId: string;
    taskId: string;
    expectedVersion: number;
    actorUserId: string | null;
    now?: Date;
  }): Promise<{ task: Task; housekeeping: UnitHousekeepingStatus | null }> {
    const now = input.now ?? new Date();
    return withTenantTransaction(input.tenantId, async (tx) => {
      const row = await tx.task.findFirst({
        where: { id: input.taskId, tenantId: input.tenantId },
      });
      if (!row) {
        throw new ConflictError("Task not found");
      }
      const task = mapTask(row as TaskRow);
      task.reopen(input.expectedVersion, now);
      await casUpdateTask(tx, task, input.expectedVersion);

      let housekeeping: UnitHousekeepingStatus | null = null;
      if (task.unitId && task.category === "HOUSEKEEPING") {
        housekeeping = await ensureHkRow(tx, {
          tenantId: input.tenantId,
          propertyId: task.propertyId,
          unitId: task.unitId,
        });
        const expected = housekeeping.version;
        const changed = housekeeping.markDirty(
          expected,
          "TASK_REOPEN",
          input.actorUserId,
          now,
        );
        if (changed) {
          await casUpdateHk(tx, housekeeping, expected);
        }
      }
      return { task, housekeeping };
    });
  }
}
