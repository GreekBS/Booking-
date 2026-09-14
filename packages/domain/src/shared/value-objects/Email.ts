import { ValueObject } from "../kernel/ValueObject";
import { ValidationError } from "../errors/DomainError";

interface EmailProps {
  value: string;
}

export class Email extends ValueObject<EmailProps> {
  private constructor(value: string) {
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(value)) {
      throw new ValidationError(`Invalid email: ${raw}`);
    }

    return new Email(value);
  }
}
