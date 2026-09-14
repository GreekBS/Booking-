import { AvailabilityEvaluator } from "../../availability/AvailabilityEvaluator";
import type { AvailabilityEvaluationResult } from "../../availability/AvailabilityEvaluator";
import { StayPeriod } from "../../shared/value-objects/StayPeriod";
import { GuestCount } from "../../shared/value-objects/GuestCount";
import { LocalDate } from "../../shared/value-objects/LocalDate";
import type { UnitAvailabilityRulesProps } from "../../shared/types/CommerceTypes";
import type {
  ICatalogQueryPort,
  ICalendarBlockRepository,
  IAvailabilityRulesRepository,
  ITimezoneService,
} from "../../ports/CommercePorts";
import { resolveUnitContext } from "../../application/commerceAccess";
import { Result } from "../../../shared/kernel/Result";

const DEFAULT_RULES: UnitAvailabilityRulesProps = {
  minNights: 1,
  maxNights: 30,
  checkInDays: [0, 1, 2, 3, 4, 5, 6],
  checkOutDays: [0, 1, 2, 3, 4, 5, 6],
  advanceMinDays: 0,
  advanceMaxDays: 365,
  turnoverNights: 0,
};

export interface EvaluateStayAvailabilityParams {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  excludeSourceIds?: string[];
}

export class StayAvailabilityEngine {
  private readonly evaluator = new AvailabilityEvaluator();

  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly calendarBlocks: ICalendarBlockRepository,
    private readonly availabilityRules: IAvailabilityRulesRepository,
    private readonly timezoneService: ITimezoneService,
  ) {}

  async evaluate(
    params: EvaluateStayAvailabilityParams,
  ): Promise<Result<AvailabilityEvaluationResult & { propertyId: string }, Error>> {
    const unitCtx = await resolveUnitContext(this.catalog, params.unitId, params.tenantId);
    if (unitCtx.isFailure) {
      return Result.fail(unitCtx.getError());
    }

    const { unit, property } = unitCtx.getValue();
    const rules =
      (await this.availabilityRules.findByUnitId(params.unitId, params.tenantId)) ?? DEFAULT_RULES;
    const blocks = await this.calendarBlocks.findActiveBlocks(params.unitId, params.tenantId);
    const today = await this.timezoneService.propertyLocalToday(property.timezone);

    const result = this.evaluator.evaluate({
      stayPeriod: StayPeriod.create(params.checkIn, params.checkOut),
      guestCount: GuestCount.create(params.guestCount),
      unitMaxGuests: unit.maxGuests,
      rules,
      activeBlocks: blocks,
      propertyLocalToday: LocalDate.create(today),
      excludeSourceIds: params.excludeSourceIds,
    });

    return Result.ok({ ...result, propertyId: property.id });
  }
}
