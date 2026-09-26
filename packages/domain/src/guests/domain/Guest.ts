import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import {
  normalizeCountry,
  normalizeEmail,
  normalizePhone,
  normalizePreferredLanguage,
} from "./guestNormalization";

export interface GuestProps {
  id: string;
  tenantId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  country: string | null;
  preferredLanguage: string | null;
  archivedAt: Date | null;
  mergedIntoGuestId: string | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGuestInput {
  id: string;
  tenantId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  preferredLanguage?: string | null;
  now?: Date;
}

export class Guest extends AggregateRoot<GuestProps> {
  private constructor(props: GuestProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  get email(): string | null {
    return this.props.email;
  }

  get emailNormalized(): string | null {
    return this.props.emailNormalized;
  }

  get phone(): string | null {
    return this.props.phone;
  }

  get phoneNormalized(): string | null {
    return this.props.phoneNormalized;
  }

  get archivedAt(): Date | null {
    return this.props.archivedAt;
  }

  get mergedIntoGuestId(): string | null {
    return this.props.mergedIntoGuestId;
  }

  get anonymizedAt(): Date | null {
    return this.props.anonymizedAt;
  }

  get isActive(): boolean {
    return this.props.archivedAt == null && this.props.mergedIntoGuestId == null;
  }

  static create(input: CreateGuestInput): Guest {
    const now = input.now ?? new Date();
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new ValidationError("Guest displayName required");
    }
    if (displayName.length > 255) {
      throw new ValidationError("Guest displayName too long");
    }

    const emailRaw = emptyToNull(input.email);
    const phoneRaw = emptyToNull(input.phone);
    const emailNormalized = normalizeEmail(emailRaw);
    const phoneNormalized = normalizePhone(phoneRaw);

    return new Guest({
      id: input.id,
      tenantId: input.tenantId,
      displayName,
      firstName: emptyToNull(input.firstName),
      lastName: emptyToNull(input.lastName),
      email: emailRaw,
      emailNormalized,
      phone: phoneRaw,
      phoneNormalized,
      country: normalizeCountry(input.country),
      preferredLanguage: normalizePreferredLanguage(input.preferredLanguage),
      archivedAt: null,
      mergedIntoGuestId: null,
      anonymizedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: GuestProps): Guest {
    return new Guest(props);
  }

  updateProfile(input: {
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    phone?: string | null;
    country?: string | null;
    preferredLanguage?: string | null;
    now?: Date;
  }): void {
    if (!this.isActive) {
      throw new ValidationError("Cannot update archived or merged Guest");
    }
    const now = input.now ?? new Date();
    if (input.displayName !== undefined) {
      const displayName = input.displayName.trim();
      if (!displayName) throw new ValidationError("Guest displayName required");
      this.props.displayName = displayName;
    }
    if (input.firstName !== undefined) {
      this.props.firstName = emptyToNull(input.firstName);
    }
    if (input.lastName !== undefined) {
      this.props.lastName = emptyToNull(input.lastName);
    }
    if (input.email !== undefined) {
      const emailRaw = emptyToNull(input.email);
      this.props.email = emailRaw;
      this.props.emailNormalized = normalizeEmail(emailRaw);
    }
    if (input.phone !== undefined) {
      const phoneRaw = emptyToNull(input.phone);
      this.props.phone = phoneRaw;
      this.props.phoneNormalized = normalizePhone(phoneRaw);
    }
    if (input.country !== undefined) {
      this.props.country = normalizeCountry(input.country);
    }
    if (input.preferredLanguage !== undefined) {
      this.props.preferredLanguage = normalizePreferredLanguage(
        input.preferredLanguage,
      );
    }
    this.props.updatedAt = now;
  }

  archive(now: Date = new Date()): void {
    if (this.props.archivedAt) return;
    this.props.archivedAt = now;
    this.props.updatedAt = now;
  }

  toProps(): GuestProps {
    return { ...this.props };
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t ? t : null;
}
