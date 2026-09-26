import { Result } from "../../shared/kernel/Result";
import type { ITimezoneService } from "../../commerce/ports/CommercePorts";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import { TURNOVER_LOOKBACK_DAYS } from "../domain/turnoverKeys";
import type {
  ApplyTurnoverEnsureResult,
  IHousekeepingTurnoverStore,
  TurnoverBookingSnapshot,
} from "../ports/IHousekeepingTurnoverStore";

function addDaysIso(isoDate: string, days: number): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y == null || m == null || d == null) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Ensure canonical turnover for one booking (create/reconcile + optional DIRTY).
 * Uses scheduled checkOut vs property-local today — no checkout event.
 */
export class ReconcileBookingTurnoverUseCase {
  constructor(
    private readonly store: IHousekeepingTurnoverStore,
    private readonly timezone: ITimezoneService,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(input: {
    tenantId: string;
    bookingId: string;
    cancel?: boolean;
    actorUserId?: string | null;
    now?: Date;
  }): Promise<
    Result<
      | ApplyTurnoverEnsureResult
      | { cancelledTaskIds: string[] }
      | { skipped: true; reason: string },
      Error
    >
  > {
    try {
      if (input.cancel) {
        const cancelled = await this.store.cancelOpenTurnoverTasks({
          tenantId: input.tenantId,
          bookingId: input.bookingId,
          actorUserId: input.actorUserId ?? null,
          now: input.now,
        });
        if (cancelled.cancelledTaskIds.length > 0) {
          await this.audit?.append({
            tenantId: input.tenantId,
            actorId: input.actorUserId ?? "system",
            action: "task.turnover_cancelled",
            resourceType: "booking",
            resourceId: input.bookingId,
            metadata: { cancelledTaskIds: cancelled.cancelledTaskIds },
            ipAddress: null,
          });
        }
        return Result.ok(cancelled);
      }

      const booking = await this.store.findConfirmedBooking(
        input.tenantId,
        input.bookingId,
      );
      if (!booking) {
        return Result.ok({
          skipped: true,
          reason: "booking_not_confirmed_or_missing",
        });
      }

      return Result.ok(
        await this.ensureForBooking(booking, input.now, input.actorUserId ?? null),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async ensureForBooking(
    booking: TurnoverBookingSnapshot,
    now?: Date,
    actorUserId: string | null = null,
  ): Promise<ApplyTurnoverEnsureResult> {
    const at = now ?? new Date();
    const propertyLocalToday = await this.timezone.propertyLocalToday(
      booking.propertyTimezone || "Europe/Athens",
      at,
    );
    const due = booking.checkOut <= propertyLocalToday;
    const result = await this.store.ensureTurnover({
      booking,
      propertyLocalToday,
      markDirtyIfDue: due,
      actorUserId,
      now: at,
    });

    if (result.created || result.reconciled || result.markedDirty) {
      await this.audit?.append({
        tenantId: booking.tenantId,
        actorId: actorUserId ?? "system",
        action: "task.turnover_reconciled",
        resourceType: "task",
        resourceId: result.task.id,
        metadata: {
          bookingId: booking.id,
          created: result.created,
          reconciled: result.reconciled,
          markedDirty: result.markedDirty,
          historyPreserved: result.historyPreserved,
          checkOut: booking.checkOut,
          propertyLocalToday,
        },
        ipAddress: null,
      });
    }

    return result;
  }
}

export interface GenerateHousekeepingTurnoverResult {
  scanned: number;
  ensured: number;
  created: number;
  markedDirty: number;
  errors: number;
}

/**
 * Window: checkOut in [propertyLocalToday - 7d, propertyLocalToday].
 * Candidate SQL uses a coarse UTC date window; each booking is re-filtered
 * with Property.timezone.
 */
export class GenerateHousekeepingTurnoverUseCase {
  constructor(
    private readonly store: IHousekeepingTurnoverStore,
    private readonly reconcile: ReconcileBookingTurnoverUseCase,
    private readonly timezone: ITimezoneService,
  ) {}

  async execute(
    now: Date = new Date(),
    limit = 200,
  ): Promise<Result<GenerateHousekeepingTurnoverResult, Error>> {
    try {
      const candidates = await this.store.listDueConfirmedBookings({
        lookbackDays: TURNOVER_LOOKBACK_DAYS,
        at: now,
        limit,
      });

      let ensured = 0;
      let created = 0;
      let markedDirty = 0;
      let errors = 0;

      for (const booking of candidates) {
        try {
          const propertyLocalToday = await this.timezone.propertyLocalToday(
            booking.propertyTimezone || "Europe/Athens",
            now,
          );
          const earliest = addDaysIso(
            propertyLocalToday,
            -TURNOVER_LOOKBACK_DAYS,
          );
          if (
            booking.checkOut > propertyLocalToday ||
            booking.checkOut < earliest
          ) {
            continue;
          }
          const result = await this.reconcile.ensureForBooking(
            booking,
            now,
            null,
          );
          ensured += 1;
          if (result.created) created += 1;
          if (result.markedDirty) markedDirty += 1;
        } catch {
          errors += 1;
        }
      }

      return Result.ok({
        scanned: candidates.length,
        ensured,
        created,
        markedDirty,
        errors,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
