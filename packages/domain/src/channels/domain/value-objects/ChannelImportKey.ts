import { ValueObject } from "../../../shared/kernel/ValueObject";
import { ValidationError } from "../../../shared/errors/DomainError";

const PREFIX = "channel:";
const MAX_PART_LENGTH = 255;

interface ChannelImportKeyProps {
  value: string;
}

function normalizePart(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PART_LENGTH) {
    throw new ValidationError(`${label} must be between 1 and 255 characters`);
  }
  return trimmed;
}

export class ChannelImportKey extends ValueObject<ChannelImportKeyProps> {
  private constructor(value: string) {
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  static create(connectionId: string, externalReservationId: string): ChannelImportKey {
    const normalizedConnectionId = normalizePart(connectionId, "Connection id");
    const normalizedExternalId = normalizePart(externalReservationId, "External reservation id");
    return new ChannelImportKey(`${PREFIX}${normalizedConnectionId}:${normalizedExternalId}`);
  }
}
