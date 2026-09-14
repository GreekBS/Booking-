import { ValueObject } from "../../../shared/kernel/ValueObject";
import { ValidationError } from "../../../shared/errors/DomainError";

export interface GuestCountProps {
  value: number;
}

export class GuestCount extends ValueObject<GuestCountProps> {
  private constructor(props: GuestCountProps) {
    super(props);
  }

  get value(): number {
    return this.props.value;
  }

  static create(value: number): GuestCount {
    if (!Number.isInteger(value) || value < 1) {
      throw new ValidationError("Guest count must be a positive integer");
    }
    return new GuestCount({ value });
  }
}
