import { PricingCalculator } from "../../pricing/PricingCalculator";
import type { PricingResult } from "../../pricing/PricingCalculator";
import { StayPeriod } from "../../shared/value-objects/StayPeriod";
import type { IRatePlanRepository } from "../../ports/CommercePorts";
import type { RatePlanProps } from "../../shared/types/CommerceTypes";
import { ValidationError } from "../../../shared/errors/DomainError";
import { Result } from "../../../shared/kernel/Result";

export interface PricedStay {
  pricing: PricingResult;
  ratePlan: RatePlanProps;
}

export class StayPricingEngine {
  private readonly calculator = new PricingCalculator();

  constructor(private readonly ratePlanRepository: IRatePlanRepository) {}

  async priceStay(
    tenantId: string,
    unitId: string,
    checkIn: string,
    checkOut: string,
    quotedAt: Date = new Date(),
  ): Promise<Result<PricingResult, Error>> {
    const detailed = await this.priceStayDetailed(
      tenantId,
      unitId,
      checkIn,
      checkOut,
      quotedAt,
    );
    if (detailed.isFailure) return Result.fail(detailed.getError());
    return Result.ok(detailed.getValue().pricing);
  }

  async priceStayDetailed(
    tenantId: string,
    unitId: string,
    checkIn: string,
    checkOut: string,
    quotedAt: Date = new Date(),
  ): Promise<Result<PricedStay, Error>> {
    const ratePlan = await this.ratePlanRepository.findByUnitId(unitId, tenantId);
    if (!ratePlan) {
      return Result.fail(new ValidationError("Rate plan not configured for unit"));
    }

    const stayPeriod = StayPeriod.create(checkIn, checkOut);
    return Result.ok({
      pricing: this.calculator.calculate(ratePlan, stayPeriod, quotedAt),
      ratePlan,
    });
  }
}
