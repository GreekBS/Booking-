import { ValueObject } from "../kernel/ValueObject";
import { ValidationError } from "../errors/DomainError";

interface IdProps {
  value: string;
}

abstract class UuidId extends ValueObject<IdProps> {
  get value(): string {
    return this.props.value;
  }

  protected static validate(value: string, label: string): string {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const cuidRegex = /^c[a-z0-9]{24,}$/i;

    if (!uuidRegex.test(value) && !cuidRegex.test(value)) {
      throw new ValidationError(`Invalid ${label}: ${value}`);
    }
    return value;
  }
}

export class TenantId extends UuidId {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): TenantId {
    return new TenantId(UuidId.validate(value, "TenantId"));
  }

  static generate(value: string): TenantId {
    return TenantId.create(value);
  }
}

export class UserId extends UuidId {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): UserId {
    return new UserId(UuidId.validate(value, "UserId"));
  }
}

export class PropertyId extends UuidId {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): PropertyId {
    return new PropertyId(UuidId.validate(value, "PropertyId"));
  }
}

export class UnitId extends UuidId {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): UnitId {
    return new UnitId(UuidId.validate(value, "UnitId"));
  }
}

export class MembershipId extends UuidId {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): MembershipId {
    return new MembershipId(UuidId.validate(value, "MembershipId"));
  }
}

export class AmenityId extends UuidId {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): AmenityId {
    return new AmenityId(UuidId.validate(value, "AmenityId"));
  }
}

export class InvitationId extends UuidId {
  private constructor(value: string) {
    super({ value });
  }

  static create(value: string): InvitationId {
    return new InvitationId(UuidId.validate(value, "InvitationId"));
  }
}
