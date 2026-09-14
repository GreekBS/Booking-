import { ValueObject } from "../../../shared/kernel/ValueObject";
import { ValidationError } from "../../../shared/errors/DomainError";

interface CredentialReferenceProps {
  value: string;
}

const MAX_LENGTH = 255;

export class CredentialReference extends ValueObject<CredentialReferenceProps> {
  private constructor(value: string) {
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): CredentialReference {
    const value = raw.trim();
    if (value.length === 0) {
      throw new ValidationError("CredentialReference must not be empty");
    }
    if (value.length > MAX_LENGTH) {
      throw new ValidationError("CredentialReference exceeds maximum length");
    }
    return new CredentialReference(value);
  }
}
