import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { Money } from "../shared/value-objects/Money";
import { LocalDate } from "../shared/value-objects/LocalDate";
import type {
  DowModifierProps,
  LosDiscountProps,
  RatePlanProps,
  RateSeasonProps,
} from "../shared/types/CommerceTypes";

/**
 * Clear fail-closed signal when a RatePlan cannot be used as a lossless
 * template under the current persistence model (C3-H2a).
 */
export class UnsupportedRatePlanTemplateError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedRatePlanTemplateError";
  }
}

const SEASON_NAME_MAX = 100;

function parsePositiveMoney(
  amount: string,
  field: string,
  currency: string,
): Result<Money, ValidationError> {
  try {
    const money = Money.create(amount, currency);
    if (money.isZero() || money.isNegative()) {
      return Result.fail(
        new ValidationError(`${field} must be greater than zero`),
      );
    }
    return Result.ok(money);
  } catch (error) {
    return Result.fail(
      error instanceof ValidationError
        ? error
        : new ValidationError(`${field} is invalid`),
    );
  }
}

function parseNonNegativeMoney(
  amount: string,
  field: string,
  currency: string,
): Result<Money, ValidationError> {
  try {
    const money = Money.create(amount, currency);
    if (money.isNegative()) {
      return Result.fail(new ValidationError(`${field} must not be negative`));
    }
    return Result.ok(money);
  } catch (error) {
    return Result.fail(
      error instanceof ValidationError
        ? error
        : new ValidationError(`${field} is invalid`),
    );
  }
}

function assertLosDiscountsSupportedForTemplate(
  losDiscounts: LosDiscountProps[] | undefined,
): Result<void, Error> {
  if (!losDiscounts || losDiscounts.length === 0) {
    return Result.ok(undefined);
  }

  // Persistence (PrismaRatePlanRepository / ratePlanToDomain) does not store
  // losDiscounts — reads always return []. Cloning would silently drop them.
  return Result.fail(
    new UnsupportedRatePlanTemplateError(
      "Rate plan template includes length-of-stay discounts that are not persisted; " +
        "remove LOS discounts or wait for LOS persistence before using as a template",
    ),
  );
}

function validateSeason(
  season: RateSeasonProps,
  index: number,
  currency: string,
): Result<RateSeasonProps, ValidationError> {
  const label = `seasons[${index}]`;
  if (!season || typeof season !== "object") {
    return Result.fail(new ValidationError(`${label} is malformed`));
  }

  const name = typeof season.name === "string" ? season.name.trim() : "";
  if (name.length === 0 || name.length > SEASON_NAME_MAX) {
    return Result.fail(
      new ValidationError(`${label}.name must be 1–${SEASON_NAME_MAX} characters`),
    );
  }

  let start: LocalDate;
  let end: LocalDate;
  try {
    start = LocalDate.create(season.startDate);
    end = LocalDate.create(season.endDate);
  } catch (error) {
    return Result.fail(
      error instanceof ValidationError
        ? error
        : new ValidationError(`${label} has invalid dates`),
    );
  }

  if (end.isBefore(start)) {
    return Result.fail(
      new ValidationError(`${label}.endDate must be on or after startDate`),
    );
  }

  const amount = parsePositiveMoney(
    season.nightlyAmount,
    `${label}.nightlyAmount`,
    currency,
  );
  if (amount.isFailure) return Result.fail(amount.getError());

  return Result.ok({
    id: season.id,
    name,
    startDate: start.value,
    endDate: end.value,
    nightlyAmount: amount.getValue().amount,
  });
}

function validateDowModifier(
  modifier: DowModifierProps,
  index: number,
  currency: string,
): Result<DowModifierProps, ValidationError> {
  const label = `dowModifiers[${index}]`;
  if (!modifier || typeof modifier !== "object") {
    return Result.fail(new ValidationError(`${label} is malformed`));
  }

  if (
    typeof modifier.dayOfWeek !== "number" ||
    !Number.isInteger(modifier.dayOfWeek) ||
    modifier.dayOfWeek < 0 ||
    modifier.dayOfWeek > 6
  ) {
    return Result.fail(
      new ValidationError(`${label}.dayOfWeek must be an integer 0–6`),
    );
  }

  if (modifier.modifierType !== "fixed" && modifier.modifierType !== "percent") {
    return Result.fail(
      new ValidationError(`${label}.modifierType must be fixed or percent`),
    );
  }

  const value = parseNonNegativeMoney(
    modifier.modifierValue,
    `${label}.modifierValue`,
    currency,
  );
  if (value.isFailure) return Result.fail(value.getError());

  return Result.ok({
    dayOfWeek: modifier.dayOfWeek,
    modifierType: modifier.modifierType,
    modifierValue: value.getValue().amount,
  });
}

/**
 * Validates a RatePlan for use as a priced template (C3-H2a).
 *
 * Rejects zero/negative base and season amounts, malformed seasons/DOW
 * modifiers, invalid currency, and non-empty LOS discounts (not persisted).
 *
 * Does not mutate the input. Does not change ConfigureRatePlan / Zod behavior.
 */
export function assertPricedRatePlan(
  plan: RatePlanProps | null | undefined,
): Result<RatePlanProps, Error> {
  if (!plan || typeof plan !== "object") {
    return Result.fail(new ValidationError("Rate plan is required"));
  }

  let currency: string;
  try {
    currency = Money.create("1.0000", plan.currency).currency;
  } catch (error) {
    return Result.fail(
      error instanceof ValidationError
        ? error
        : new ValidationError("Invalid currency code"),
    );
  }

  const base = parsePositiveMoney(
    plan.baseNightlyAmount,
    "baseNightlyAmount",
    currency,
  );
  if (base.isFailure) return Result.fail(base.getError());

  const losCheck = assertLosDiscountsSupportedForTemplate(plan.losDiscounts);
  if (losCheck.isFailure) return Result.fail(losCheck.getError());

  if (!Array.isArray(plan.seasons)) {
    return Result.fail(new ValidationError("seasons must be an array"));
  }
  if (!Array.isArray(plan.dowModifiers)) {
    return Result.fail(new ValidationError("dowModifiers must be an array"));
  }

  const seasons: RateSeasonProps[] = [];
  for (let i = 0; i < plan.seasons.length; i += 1) {
    const season = validateSeason(plan.seasons[i]!, i, currency);
    if (season.isFailure) return Result.fail(season.getError());
    seasons.push(season.getValue());
  }

  const seenDays = new Set<number>();
  const dowModifiers: DowModifierProps[] = [];
  for (let i = 0; i < plan.dowModifiers.length; i += 1) {
    const mod = validateDowModifier(plan.dowModifiers[i]!, i, currency);
    if (mod.isFailure) return Result.fail(mod.getError());
    const value = mod.getValue();
    if (seenDays.has(value.dayOfWeek)) {
      return Result.fail(
        new ValidationError(
          `dowModifiers has duplicate dayOfWeek: ${value.dayOfWeek}`,
        ),
      );
    }
    seenDays.add(value.dayOfWeek);
    dowModifiers.push(value);
  }

  return Result.ok({
    baseNightlyAmount: base.getValue().amount,
    currency,
    seasons,
    dowModifiers,
    losDiscounts: [],
  });
}

/**
 * Deep-clones a validated RatePlan for another Unit (pure; no DB writes).
 *
 * - New season identities via {@link IIdGenerator}
 * - No shared mutable references with the source
 * - Does not copy UnitAvailabilityRules, bookings, or calendar blocks
 * - RatePlanProps has no unitId — target unit is assigned by the caller/repository
 */
export function cloneRatePlanProps(
  source: RatePlanProps,
  idGenerator: IIdGenerator,
): Result<RatePlanProps, Error> {
  const validated = assertPricedRatePlan(source);
  if (validated.isFailure) return Result.fail(validated.getError());

  const plan = validated.getValue();

  const clone: RatePlanProps = {
    baseNightlyAmount: plan.baseNightlyAmount,
    currency: plan.currency,
    seasons: plan.seasons.map((season) => ({
      id: idGenerator.generate(),
      name: season.name,
      startDate: season.startDate,
      endDate: season.endDate,
      nightlyAmount: season.nightlyAmount,
    })),
    dowModifiers: plan.dowModifiers.map((modifier) => ({
      dayOfWeek: modifier.dayOfWeek,
      modifierType: modifier.modifierType,
      modifierValue: modifier.modifierValue,
    })),
    losDiscounts: [],
  };

  return Result.ok(clone);
}
