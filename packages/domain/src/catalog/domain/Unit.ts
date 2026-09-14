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
      status: "active",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: UnitProps): Unit {
    return new Unit(props);
  }

  update(details: Partial<Pick<UnitProps, "name" | "maxGuests" | "bedrooms" | "bathrooms" | "status">>): void {
    if (details.name !== undefined) this.props.name = details.name.trim();
    if (details.maxGuests !== undefined) this.props.maxGuests = details.maxGuests;
    if (details.bedrooms !== undefined) this.props.bedrooms = details.bedrooms;
    if (details.bathrooms !== undefined) this.props.bathrooms = details.bathrooms;
    if (details.status !== undefined) this.props.status = details.status;
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
