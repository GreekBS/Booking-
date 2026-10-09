import { Entity } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import type { RoomTypeStatus } from "../../shared/types/index";

/**
 * Commercial accommodation category (e.g. Deluxe Double Room).
 * Not independently bookable — physical inventory remains {@link Unit}.
 * CRUD application layer arrives in Phase C2.
 */
export interface RoomTypeProps {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  code: string | null;
  description: string | null;
  maxGuests: number;
  maxAdults: number | null;
  maxChildren: number | null;
  status: RoomTypeStatus;
  sortOrder: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoomTypeProps {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  maxGuests: number;
  maxAdults?: number | null;
  maxChildren?: number | null;
  status?: RoomTypeStatus;
  sortOrder?: number;
}

function normalizeOptionalCode(code: string | null | undefined): string | null {
  if (code === undefined || code === null) return null;
  const trimmed = code.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function assertOccupancyInvariants(input: {
  maxGuests: number;
  maxAdults: number | null;
  maxChildren: number | null;
}): void {
  if (!Number.isInteger(input.maxGuests) || input.maxGuests < 1 || input.maxGuests > 100) {
    throw new ValidationError("RoomType.maxGuests must be an integer between 1 and 100");
  }
  if (
    input.maxAdults !== null &&
    (!Number.isInteger(input.maxAdults) || input.maxAdults < 0 || input.maxAdults > 100)
  ) {
    throw new ValidationError("RoomType.maxAdults must be null or an integer between 0 and 100");
  }
  if (
    input.maxChildren !== null &&
    (!Number.isInteger(input.maxChildren) ||
      input.maxChildren < 0 ||
      input.maxChildren > 100)
  ) {
    throw new ValidationError(
      "RoomType.maxChildren must be null or an integer between 0 and 100",
    );
  }
  if (
    input.maxAdults !== null &&
    input.maxChildren !== null &&
    input.maxAdults + input.maxChildren > input.maxGuests
  ) {
    throw new ValidationError(
      "RoomType maxAdults + maxChildren cannot exceed maxGuests",
    );
  }
}

export class RoomType extends Entity<RoomTypeProps> {
  private constructor(props: RoomTypeProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get name(): string {
    return this.props.name;
  }

  get code(): string | null {
    return this.props.code;
  }

  get description(): string | null {
    return this.props.description;
  }

  get maxGuests(): number {
    return this.props.maxGuests;
  }

  get maxAdults(): number | null {
    return this.props.maxAdults;
  }

  get maxChildren(): number | null {
    return this.props.maxChildren;
  }

  get status(): RoomTypeStatus {
    return this.props.status;
  }

  get sortOrder(): number {
    return this.props.sortOrder;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  get isActive(): boolean {
    return this.props.status === "active" && this.props.deletedAt === null;
  }

  static create(props: CreateRoomTypeProps): RoomType {
    const name = props.name.trim();
    if (name.length === 0) {
      throw new ValidationError("RoomType.name is required");
    }
    if (name.length > 255) {
      throw new ValidationError("RoomType.name must be at most 255 characters");
    }

    const code = normalizeOptionalCode(props.code);
    if (code && code.length > 64) {
      throw new ValidationError("RoomType.code must be at most 64 characters");
    }

    const maxAdults = props.maxAdults ?? null;
    const maxChildren = props.maxChildren ?? null;
    assertOccupancyInvariants({
      maxGuests: props.maxGuests,
      maxAdults,
      maxChildren,
    });

    const sortOrder = props.sortOrder ?? 0;
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new ValidationError("RoomType.sortOrder must be a non-negative integer");
    }

    const now = new Date();
    return new RoomType({
      id: props.id,
      tenantId: props.tenantId,
      propertyId: props.propertyId,
      name,
      code,
      description: props.description?.trim() ? props.description.trim() : null,
      maxGuests: props.maxGuests,
      maxAdults,
      maxChildren,
      status: props.status ?? "active",
      sortOrder,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: RoomTypeProps): RoomType {
    return new RoomType(props);
  }

  softDelete(): void {
    if (this.props.deletedAt) return;
    this.props.deletedAt = new Date();
    this.props.status = "inactive";
    this.props.updatedAt = new Date();
  }

  toProps(): RoomTypeProps {
    return { ...this.props };
  }
}
