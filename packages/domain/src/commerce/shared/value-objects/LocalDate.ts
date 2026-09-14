import { ValueObject } from "../../../shared/kernel/ValueObject";
import { ValidationError } from "../../../shared/errors/DomainError";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface LocalDateProps {
  value: string;
}

export class LocalDate extends ValueObject<LocalDateProps> {
  private constructor(props: LocalDateProps) {
    super(props);
  }

  get value(): string {
    return this.props.value;
  }

  static create(value: string): LocalDate {
    const trimmed = value.trim();
    if (!DATE_REGEX.test(trimmed)) {
      throw new ValidationError(`Invalid local date format: ${value}`);
    }

    const [yearStr, monthStr, dayStr] = trimmed.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const utc = Date.UTC(year, month - 1, day);
    const check = new Date(utc);
    if (
      check.getUTCFullYear() !== year ||
      check.getUTCMonth() !== month - 1 ||
      check.getUTCDate() !== day
    ) {
      throw new ValidationError(`Invalid local date: ${value}`);
    }

    return new LocalDate({ value: trimmed });
  }

  dayOfWeek(): number {
    const { year, month, day } = parseParts(this.props.value);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  addDays(days: number): LocalDate {
    const { year, month, day } = parseParts(this.props.value);
    const next = new Date(Date.UTC(year, month - 1, day + days));
    const value = [
      next.getUTCFullYear(),
      String(next.getUTCMonth() + 1).padStart(2, "0"),
      String(next.getUTCDate()).padStart(2, "0"),
    ].join("-");
    return LocalDate.create(value);
  }

  daysUntil(other: LocalDate): number {
    return Math.round((other.toEpochDay() - this.toEpochDay()));
  }

  isBefore(other: LocalDate): boolean {
    return this.props.value < other.props.value;
  }

  isAfter(other: LocalDate): boolean {
    return this.props.value > other.props.value;
  }

  isBeforeOrEqual(other: LocalDate): boolean {
    return this.props.value <= other.props.value;
  }

  isAfterOrEqual(other: LocalDate): boolean {
    return this.props.value >= other.props.value;
  }

  toEpochDay(): number {
    const { year, month, day } = parseParts(this.props.value);
    return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  }

  equalsDate(other: LocalDate): boolean {
    return this.props.value === other.props.value;
  }
}

function parseParts(value: string): { year: number; month: number; day: number } {
  const [yearStr, monthStr, dayStr] = value.split("-");
  return {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
  };
}
