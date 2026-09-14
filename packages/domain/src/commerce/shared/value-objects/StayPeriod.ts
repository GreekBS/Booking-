import { ValueObject } from "../../../shared/kernel/ValueObject";
import { ValidationError } from "../../../shared/errors/DomainError";
import { LocalDate } from "./LocalDate";

export interface StayPeriodProps {
  checkIn: string;
  checkOut: string;
}

export class StayPeriod extends ValueObject<StayPeriodProps> {
  private readonly _checkIn: LocalDate;
  private readonly _checkOut: LocalDate;

  private constructor(props: StayPeriodProps, checkIn: LocalDate, checkOut: LocalDate) {
    super(props);
    this._checkIn = checkIn;
    this._checkOut = checkOut;
  }

  get checkIn(): LocalDate {
    return this._checkIn;
  }

  get checkOut(): LocalDate {
    return this._checkOut;
  }

  static create(checkIn: string, checkOut: string): StayPeriod {
    const checkInDate = LocalDate.create(checkIn);
    const checkOutDate = LocalDate.create(checkOut);

    if (!checkOutDate.isAfter(checkInDate)) {
      throw new ValidationError("checkOut must be after checkIn");
    }

    return new StayPeriod(
      { checkIn: checkInDate.value, checkOut: checkOutDate.value },
      checkInDate,
      checkOutDate,
    );
  }

  nightCount(): number {
    return this._checkIn.daysUntil(this._checkOut);
  }

  nights(): LocalDate[] {
    const result: LocalDate[] = [];
    let current = this._checkIn;
    while (current.isBefore(this._checkOut)) {
      result.push(current);
      current = current.addDays(1);
    }
    return result;
  }

  overlaps(other: StayPeriod): boolean {
    return (
      this._checkIn.isBefore(other._checkOut) && other._checkIn.isBefore(this._checkOut)
    );
  }

  containsNight(date: LocalDate): boolean {
    return date.isAfterOrEqual(this._checkIn) && date.isBefore(this._checkOut);
  }
}
