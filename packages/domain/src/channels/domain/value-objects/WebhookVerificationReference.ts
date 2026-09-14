import { ValueObject } from "../../../shared/kernel/ValueObject";
import { ValidationError } from "../../../shared/errors/DomainError";

interface WebhookVerificationReferenceProps {
  value: string;
}

const MAX_LENGTH = 255;

export class WebhookVerificationReference extends ValueObject<WebhookVerificationReferenceProps> {
  private constructor(value: string) {
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static create(raw: string): WebhookVerificationReference {
    const value = raw.trim();
    if (value.length === 0) {
      throw new ValidationError("WebhookVerificationReference must not be empty");
    }
    if (value.length > MAX_LENGTH) {
      throw new ValidationError("WebhookVerificationReference exceeds maximum length");
    }
    return new WebhookVerificationReference(value);
  }
}
