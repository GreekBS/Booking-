import { Entity } from "../../shared/kernel/Entity";
import type { UnitStatus } from "../../shared/types/index";

export interface UnitProps {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  slug: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  status: UnitStatus;
  /** Optional commercial RoomType. Null for villas / uncategorized units. */
  roomTypeId: string | null;
  /** Optional property-scoped room identifier (e.g. "204"). */
  roomNumber: string | null;
  /** Optional floor label. */
  floor: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUnitProps {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  slug: string;
  maxGuests: number;
  bedrooms?: number;
  bathrooms?: number;
  /** Defaults to active. Hotels seed Entire Property as inactive (C3-H1). */
  status?: UnitStatus;
  roomTypeId?: string | null;
  roomNumber?: string | null;
  floor?: string | null;
}

function normalizeOptionalLabel(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class Unit extends Entity<UnitProps> {
  private constructor(props: UnitProps) {
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

  get slug(): string {
    return this.props.slug;
  }

  get maxGuests(): number {
    return this.props.maxGuests;
  }

  get bedrooms(): number {
    return this.props.bedrooms;
  }

  get bathrooms(): number {
    return this.props.bathrooms;
  }

  get status(): UnitStatus {
    return this.props.status;
  }

  get roomTypeId(): string | null {
    return this.props.roomTypeId;
  }

  get roomNumber(): string | null {
    return this.props.roomNumber;
  }

  get floor(): string | null {
    return this.props.floor;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  static create(props: CreateUnitProps): Unit {
    const now = new Date();
    return new Unit({
      id: props.id,
      tenantId: props.tenantId,
      propertyId: props.propertyId,
      name: props.name.trim(),
      slug: props.slug,
      maxGuests: props.maxGuests,
      bedrooms: props.bedrooms ?? 1,
      bathrooms: props.bathrooms ?? 1,
      status: props.status ?? "active",
      roomTypeId: props.roomTypeId ?? null,
      roomNumber: normalizeOptionalLabel(props.roomNumber),
      floor: normalizeOptionalLabel(props.floor),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Reconstitute from persistence. Hotel metadata fields default to null when
   * omitted so pre-C1 fixtures and partial props remain valid.
   */
  static reconstitute(
    props: Omit<UnitProps, "roomTypeId" | "roomNumber" | "floor"> &
      Partial<Pick<UnitProps, "roomTypeId" | "roomNumber" | "floor">>,
  ): Unit {
    return new Unit({
      ...props,
      roomTypeId: props.roomTypeId ?? null,
      roomNumber: props.roomNumber ?? null,
      floor: props.floor ?? null,
    });
  }

  update(
    details: Partial<
      Pick<
        UnitProps,
        | "name"
        | "maxGuests"
        | "bedrooms"
        | "bathrooms"
        | "status"
        | "roomTypeId"
        | "roomNumber"
        | "floor"
      >
    >,
  ): void {
    if (details.name !== undefined) this.props.name = details.name.trim();
    if (details.maxGuests !== undefined) this.props.maxGuests = details.maxGuests;
    if (details.bedrooms !== undefined) this.props.bedrooms = details.bedrooms;
    if (details.bathrooms !== undefined) this.props.bathrooms = details.bathrooms;
    if (details.status !== undefined) this.props.status = details.status;
    if (details.roomTypeId !== undefined) {
      this.props.roomTypeId = details.roomTypeId;
    }
    if (details.roomNumber !== undefined) {
      this.props.roomNumber = normalizeOptionalLabel(details.roomNumber);
    }
    if (details.floor !== undefined) {
      this.props.floor = normalizeOptionalLabel(details.floor);
    }
    this.props.updatedAt = new Date();
  }

  archive(): void {
    this.props.status = "archived";
    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();
  }

  toProps(): UnitProps {
    return { ...this.props };
  }
}
