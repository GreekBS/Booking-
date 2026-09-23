import { Hold } from "../booking/domain/Hold";
import { Quote } from "../booking/domain/Quote";
import { Booking } from "../booking/domain/Booking";
import type { AvailabilityEvaluationResult } from "../availability/AvailabilityEvaluator";
import type {
  CalendarBlockView,
  ConfirmationMode,
  OperatorBlockType,
  UnitAvailabilityRulesProps,
  RatePlanProps,
} from "../shared/types/CommerceTypes";
import { isOperatorBlockType } from "../shared/types/CommerceTypes";
import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository, IOutboxRepository } from "../../shared/ports/InfrastructurePorts";
import type {
  ICatalogQueryPort,
  ICalendarBlockRepository,
  IHoldRepository,
  IQuoteRepository,
  IBookingRepository,
  IRatePlanRepository,
  IAvailabilityRulesRepository,
  ICommerceFlowRepository,
} from "../ports/CommercePorts";
import { PERMISSIONS } from "@hcp/permissions";
import {
  assertCommercePropertyAccess,
  resolveUnitContext,
  resolveUnitContextForOperatorRead,
} from "./commerceAccess";
import { ReservationOrchestrator } from "../reservation/ReservationOrchestrator";
import {
  mutationOriginDirect,
  mutationOriginOperator,
} from "../../shared/types/MutationOrigin";
import { UnitExternalSyncRequiredEvent } from "../../channels/application/UnitExternalSyncRequiredEvent";

const DEFAULT_RULES: UnitAvailabilityRulesProps = {
  minNights: 1,
  maxNights: 30,
  checkInDays: [0, 1, 2, 3, 4, 5, 6],
  checkOutDays: [0, 1, 2, 3, 4, 5, 6],
  advanceMinDays: 0,
  advanceMaxDays: 365,
  turnoverNights: 0,
};

export interface CheckAvailabilityCommand {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export class CheckAvailabilityUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: CheckAvailabilityCommand,
    actor: ActorContext,
  ): Promise<Result<AvailabilityEvaluationResult, Error>> {
    try {
      const unitCtx = await resolveUnitContext(this.catalog, command.unitId, command.tenantId);
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      const { property } = unitCtx.getValue();
      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        command.tenantId,
        property.id,
        PERMISSIONS.AVAILABILITY_READ_TENANT,
        PERMISSIONS.AVAILABILITY_READ_ASSIGNED,
      );

      const result = await this.orchestrator.evaluateAvailability({
        tenantId: command.tenantId,
        unitId: command.unitId,
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        guestCount: command.guestCount,
      });
      if (result.isFailure) {
        return Result.fail(result.getError());
      }

      const evaluation = result.getValue();
      return Result.ok({
        available: evaluation.available,
        reasons: evaluation.reasons,
        nights: evaluation.nights,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface CreateManualBlockCommand {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  blockType?: OperatorBlockType;
  reason?: string | null;
}

export class CreateManualBlockUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly calendarBlocks: ICalendarBlockRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly outboxRepository: IOutboxRepository,
  ) {}

  async execute(
    command: CreateManualBlockCommand,
    actor: ActorContext,
  ): Promise<Result<{ blockId: string }, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.AVAILABILITY_UPDATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const unitCtx = await resolveUnitContext(this.catalog, command.unitId, command.tenantId);
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      const { unit, property } = unitCtx.getValue();
      const blockId = this.idGenerator.generate();

      await this.calendarBlocks.saveOperatorBlock({
        id: blockId,
        tenantId: command.tenantId,
        unitId: unit.id,
        propertyId: property.id,
        blockType: command.blockType ?? "manual",
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        reason: command.reason,
      });

      await this.outboxRepository.saveEvents([
        new UnitExternalSyncRequiredEvent({
          tenantId: command.tenantId,
          unitId: unit.id,
          propertyId: property.id,
          from: command.checkIn,
          to: command.checkOut,
          changeKinds: ["availability"],
          mutationOrigin: mutationOriginOperator(),
          revision: Date.now(),
          sourceEventId: `manual-block-create:${blockId}`,
        }),
      ]);

      return Result.ok({ blockId });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface DeleteManualBlockCommand {
  tenantId: string;
  unitId: string;
  blockId: string;
}

export class DeleteManualBlockUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly calendarBlocks: ICalendarBlockRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly outboxRepository: IOutboxRepository,
  ) {}

  async execute(
    command: DeleteManualBlockCommand,
    actor: ActorContext,
  ): Promise<Result<void, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.AVAILABILITY_UPDATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const block = await this.calendarBlocks.findById(command.blockId, command.tenantId);
      if (!block || !isOperatorBlockType(block.blockType)) {
        return Result.fail(new ValidationError("Block not found"));
      }

      if (block.unitId !== command.unitId) {
        return Result.fail(new ValidationError("Block does not belong to unit"));
      }

      const unitCtx = await resolveUnitContext(this.catalog, command.unitId, command.tenantId);
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }
      const { property } = unitCtx.getValue();

      await this.calendarBlocks.releaseBlock(command.blockId, command.tenantId);

      await this.outboxRepository.saveEvents([
        new UnitExternalSyncRequiredEvent({
          tenantId: command.tenantId,
          unitId: block.unitId,
          propertyId: property.id,
          from: block.checkIn,
          to: block.checkOut,
          changeKinds: ["availability"],
          mutationOrigin: mutationOriginOperator(),
          revision: Date.now(),
          sourceEventId: `manual-block-release:${command.blockId}`,
        }),
      ]);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface CreateHoldCommand {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  sessionRef?: string | null;
}

export class CreateHoldUseCase {
  constructor(
    private readonly holdRepository: IHoldRepository,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: CreateHoldCommand,
    actor: ActorContext,
  ): Promise<Result<Hold, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.HOLD_CREATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const holdResult = await this.orchestrator.prepareHold({
        tenantId: command.tenantId,
        unitId: command.unitId,
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        guestCount: command.guestCount,
        holdId: this.idGenerator.generate(),
        sessionRef: command.sessionRef,
      });
      if (holdResult.isFailure) {
        return Result.fail(holdResult.getError());
      }

      const hold = holdResult.getValue();
      await this.holdRepository.save(hold);
      return Result.ok(hold);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface ReleaseHoldCommand {
  tenantId: string;
  holdId: string;
}

export class ReleaseHoldUseCase {
  constructor(
    private readonly holdRepository: IHoldRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: ReleaseHoldCommand,
    actor: ActorContext,
  ): Promise<Result<void, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.HOLD_CREATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const hold = await this.holdRepository.findById(command.holdId, command.tenantId);
      if (!hold) {
        return Result.fail(new ValidationError("Hold not found"));
      }

      hold.release();
      await this.holdRepository.save(hold);
      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ExpireHoldsUseCase {
  constructor(private readonly holdRepository: IHoldRepository) {}

  async execute(now: Date = new Date(), limit = 100): Promise<Result<{ expired: number }, Error>> {
    try {
      const holds = await this.holdRepository.findExpiredActive(now, limit);
      let expired = 0;

      for (const hold of holds) {
        if (!hold.isExpired(now)) {
          continue;
        }
        hold.expire(now);
        await this.holdRepository.save(hold);
        expired += 1;
      }

      return Result.ok({ expired });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface CreateQuoteCommand {
  tenantId: string;
  holdId: string;
}

export class CreateQuoteUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly holdRepository: IHoldRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: CreateQuoteCommand,
    actor: ActorContext,
  ): Promise<Result<Quote, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.QUOTE_CREATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const hold = await this.holdRepository.findById(command.holdId, command.tenantId);
      if (!hold) {
        return Result.fail(new ValidationError("Hold not found"));
      }

      const property = await this.catalog.getProperty(hold.propertyId, command.tenantId);
      if (!property) {
        return Result.fail(new ValidationError("Property not found"));
      }

      const quoteResult = await this.orchestrator.prepareQuoteForHold({
        tenantId: command.tenantId,
        hold,
        quoteId: this.idGenerator.generate(),
        snapshotId: this.idGenerator.generate(),
        propertyTimezone: property.timezone,
      });
      if (quoteResult.isFailure) {
        return Result.fail(quoteResult.getError());
      }

      const quote = quoteResult.getValue();
      await this.quoteRepository.save(quote);
      return Result.ok(quote);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface CreateBookingCommand {
  tenantId: string;
  quoteId: string;
  guest: { name: string; email: string; phone: string | null };
  confirmationMode?: ConfirmationMode;
}

export class CreateBookingUseCase {
  constructor(
    private readonly holdRepository: IHoldRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly commerceFlowRepository: ICommerceFlowRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: CreateBookingCommand,
    actor: ActorContext,
    audit?: { ipAddress: string | null },
  ): Promise<Result<Booking, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_CREATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const quote = await this.quoteRepository.findById(command.quoteId, command.tenantId);
      if (!quote) {
        return Result.fail(new ValidationError("Quote not found"));
      }

      const hold = await this.holdRepository.findById(quote.holdId, command.tenantId);
      if (!hold) {
        return Result.fail(new ValidationError("Hold not found"));
      }

      const booking = Booking.create({
        id: this.idGenerator.generate(),
        hold,
        quote,
        guest: command.guest,
        confirmationMode: command.confirmationMode ?? "manual",
        mutationOrigin: actor.userId.startsWith("storefront:")
          ? mutationOriginDirect()
          : mutationOriginOperator(),
      });

      await this.commerceFlowRepository.saveHoldAndBooking(hold, booking);

      if (!actor.userId.startsWith("storefront:")) {
        await this.auditLogRepository.append({
          tenantId: command.tenantId,
          actorId: actor.userId,
          action: "booking.created",
          resourceType: "Booking",
          resourceId: booking.id,
          metadata: { quoteId: quote.id, holdId: hold.id },
          ipAddress: audit?.ipAddress ?? null,
        });
      }

      return Result.ok(booking);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface ConfirmBookingCommand {
  tenantId: string;
  bookingId: string;
}

export class ConfirmBookingUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: ConfirmBookingCommand,
    actor: ActorContext,
    audit?: { ipAddress: string | null },
  ): Promise<Result<Booking, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_CREATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const booking = await this.bookingRepository.findById(command.bookingId, command.tenantId);
      if (!booking) {
        return Result.fail(new ValidationError("Booking not found"));
      }

      booking.confirm(new Date(), mutationOriginOperator());
      await this.bookingRepository.save(booking);

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: actor.userId,
        action: "booking.confirmed",
        resourceType: "Booking",
        resourceId: booking.id,
        metadata: {},
        ipAddress: audit?.ipAddress ?? null,
      });

      return Result.ok(booking);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface CancelBookingCommand {
  tenantId: string;
  bookingId: string;
  reason?: string;
}

export class CancelBookingUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: CancelBookingCommand,
    actor: ActorContext,
    audit?: { ipAddress: string | null },
  ): Promise<Result<Booking, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_CANCEL_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const booking = await this.bookingRepository.findById(command.bookingId, command.tenantId);
      if (!booking) {
        return Result.fail(new ValidationError("Booking not found"));
      }

      booking.cancel(command.reason, new Date(), mutationOriginOperator());
      await this.bookingRepository.save(booking);

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: actor.userId,
        action: "booking.cancelled",
        resourceType: "Booking",
        resourceId: booking.id,
        metadata: { reason: command.reason ?? null },
        ipAddress: audit?.ipAddress ?? null,
      });

      return Result.ok(booking);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface GetUnitCalendarCommand {
  tenantId: string;
  unitId: string;
  from: string;
  to: string;
}

export interface UnitCalendarResult {
  blocks: CalendarBlockView[];
  holds: Array<{ id: string; checkIn: string; checkOut: string; status: string; expiresAt: string }>;
  bookings: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    status: string;
    guestName: string;
  }>;
}

export class GetUnitCalendarUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly calendarBlocks: ICalendarBlockRepository,
    private readonly holdRepository: IHoldRepository,
    private readonly bookingRepository: IBookingRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: GetUnitCalendarCommand,
    actor: ActorContext,
  ): Promise<Result<UnitCalendarResult, Error>> {
    try {
      const unitCtx = await resolveUnitContextForOperatorRead(
        this.catalog,
        command.unitId,
        command.tenantId,
      );
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        command.tenantId,
        unitCtx.getValue().property.id,
        PERMISSIONS.BOOKING_READ_TENANT,
        PERMISSIONS.BOOKING_READ_ASSIGNED,
      );

      const range = { from: command.from, to: command.to };
      const [blocks, holds, bookings] = await Promise.all([
        this.calendarBlocks.findCalendarBlocks(
          command.unitId,
          command.tenantId,
          range,
        ),
        this.holdRepository.findActiveByUnit(
          command.unitId,
          command.tenantId,
          range,
        ),
        this.bookingRepository.findByUnit(
          command.unitId,
          command.tenantId,
          range,
        ),
      ]);

      return Result.ok({
        blocks,
        holds: holds.map((hold) => ({
          id: hold.id,
          checkIn: hold.stayPeriod.checkIn.value,
          checkOut: hold.stayPeriod.checkOut.value,
          status: hold.status,
          expiresAt: hold.expiresAt.toISOString(),
        })),
        bookings: bookings.map((booking) => ({
          id: booking.id,
          checkIn: booking.stayPeriod.checkIn.value,
          checkOut: booking.stayPeriod.checkOut.value,
          status: booking.status,
          guestName: booking.guest.name,
        })),
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface ConfigureAvailabilityRulesCommand {
  tenantId: string;
  unitId: string;
  rules: UnitAvailabilityRulesProps;
}

export class ConfigureAvailabilityRulesUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly availabilityRules: IAvailabilityRulesRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly outboxRepository: IOutboxRepository,
  ) {}

  async execute(
    command: ConfigureAvailabilityRulesCommand,
    actor: ActorContext,
  ): Promise<Result<UnitAvailabilityRulesProps, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.AVAILABILITY_UPDATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const unitCtx = await resolveUnitContext(this.catalog, command.unitId, command.tenantId);
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      const { unit, property } = unitCtx.getValue();
      await this.availabilityRules.save(command.tenantId, command.unitId, command.rules);

      const from = new Date().toISOString().slice(0, 10);
      const toDate = new Date();
      toDate.setUTCDate(toDate.getUTCDate() + 365);
      const to = toDate.toISOString().slice(0, 10);

      await this.outboxRepository.saveEvents([
        new UnitExternalSyncRequiredEvent({
          tenantId: command.tenantId,
          unitId: unit.id,
          propertyId: property.id,
          from,
          to,
          changeKinds: ["restrictions", "availability"],
          mutationOrigin: mutationOriginOperator(),
          revision: Date.now(),
          sourceEventId: `availability-rules:${unit.id}:${Date.now()}`,
        }),
      ]);

      return Result.ok(command.rules);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface ConfigureRatePlanCommand {
  tenantId: string;
  unitId: string;
  ratePlan: RatePlanProps;
}

export class ConfigureRatePlanUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly ratePlanRepository: IRatePlanRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly outboxRepository: IOutboxRepository,
  ) {}

  async execute(
    command: ConfigureRatePlanCommand,
    actor: ActorContext,
  ): Promise<Result<RatePlanProps, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.PRICING_UPDATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const unitCtx = await resolveUnitContext(this.catalog, command.unitId, command.tenantId);
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      const { unit, property } = unitCtx.getValue();
      await this.ratePlanRepository.save(command.tenantId, command.unitId, command.ratePlan);

      const from = new Date().toISOString().slice(0, 10);
      const toDate = new Date();
      toDate.setUTCDate(toDate.getUTCDate() + 365);
      const to = toDate.toISOString().slice(0, 10);

      await this.outboxRepository.saveEvents([
        new UnitExternalSyncRequiredEvent({
          tenantId: command.tenantId,
          unitId: unit.id,
          propertyId: property.id,
          from,
          to,
          changeKinds: ["rates"],
          mutationOrigin: mutationOriginOperator(),
          revision: Date.now(),
          sourceEventId: `rate-plan:${unit.id}:${Date.now()}`,
        }),
      ]);

      return Result.ok(command.ratePlan);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetAvailabilityRulesUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly availabilityRules: IAvailabilityRulesRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    unitId: string,
    actor: ActorContext,
  ): Promise<Result<UnitAvailabilityRulesProps, Error>> {
    try {
      const unitCtx = await resolveUnitContextForOperatorRead(this.catalog, unitId, tenantId);
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        tenantId,
        unitCtx.getValue().property.id,
        PERMISSIONS.AVAILABILITY_READ_TENANT,
        PERMISSIONS.AVAILABILITY_READ_ASSIGNED,
      );

      const rules =
        (await this.availabilityRules.findByUnitId(unitId, tenantId)) ?? DEFAULT_RULES;
      return Result.ok(rules);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetRatePlanUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly ratePlanRepository: IRatePlanRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    unitId: string,
    actor: ActorContext,
  ): Promise<Result<RatePlanProps | null, Error>> {
    try {
      const unitCtx = await resolveUnitContextForOperatorRead(this.catalog, unitId, tenantId);
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        tenantId,
        unitCtx.getValue().property.id,
        PERMISSIONS.PRICING_READ_TENANT,
        PERMISSIONS.PRICING_READ_ASSIGNED,
      );

      const plan = await this.ratePlanRepository.findByUnitId(unitId, tenantId);
      return Result.ok(plan);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetQuoteUseCase {
  constructor(
    private readonly quoteRepository: IQuoteRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    quoteId: string,
    actor: ActorContext,
  ): Promise<Result<Quote, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, PERMISSIONS.QUOTE_CREATE_TENANT, tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const quote = await this.quoteRepository.findById(quoteId, tenantId);
      if (!quote) {
        return Result.fail(new ValidationError("Quote not found"));
      }

      return Result.ok(quote);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListBookingsUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly bookingRepository: IBookingRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    unitId: string,
    actor: ActorContext,
  ): Promise<Result<Booking[], Error>> {
    try {
      const unitCtx = await resolveUnitContext(this.catalog, unitId, tenantId);
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        tenantId,
        unitCtx.getValue().property.id,
        PERMISSIONS.BOOKING_READ_TENANT,
        PERMISSIONS.BOOKING_READ_ASSIGNED,
      );

      const bookings = await this.bookingRepository.findByUnit(unitId, tenantId);
      return Result.ok(bookings);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetBookingUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    actor: ActorContext,
  ): Promise<Result<Booking, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_TENANT, tenantId) &&
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_READ_ASSIGNED,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const booking = await this.bookingRepository.findById(bookingId, tenantId);
      if (!booking) {
        return Result.fail(new ValidationError("Booking not found"));
      }

      return Result.ok(booking);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
