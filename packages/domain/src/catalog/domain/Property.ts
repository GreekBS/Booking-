import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import { Location } from "../../shared/value-objects/Location";
import { PropertyPolicies } from "../../shared/value-objects/Policies";
import { PropertySlug } from "../../shared/value-objects/Slug";
import type { PropertyStatus, PropertyType } from "../../shared/types/index";
import { Unit, type UnitProps } from "./Unit";
import {
  PropertyArchivedEvent,
  PropertyCreatedEvent,
  PropertyUpdatedEvent,
  UnitAddedEvent,
  UnitRemovedEvent,
  UnitUpdatedEvent,
} from "./events/CatalogEvents";

export interface PropertyProps {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  type: PropertyType;
  status: PropertyStatus;
  timezone: string;
  location: Location;
  policies: PropertyPolicies;
  amenityIds: string[];
  units: UnitProps[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePropertyProps {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string | null;
  type?: PropertyType;
  timezone?: string;
  location?: Location;
  policies?: PropertyPolicies;
  defaultUnit?: {
    id: string;
    maxGuests: number;
    bedrooms?: number;
    bathrooms?: number;
  };
}

export interface AddUnitProps {
  id: string;
  name: string;
  slug: string;
  maxGuests: number;
  bedrooms?: number;
  bathrooms?: number;
}

export class Property extends AggregateRoot<PropertyProps> {
  private _units: Unit[];

  private constructor(props: PropertyProps) {
    super(props);
    this._units = props.units.map((u) => Unit.reconstitute(u));
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get name(): string {
    return this.props.name;
  }

  get slug(): PropertySlug {
    return PropertySlug.create(this.props.slug);
  }

  get description(): string | null {
    return this.props.description;
  }

  get type(): PropertyType {
    return this.props.type;
  }

  get status(): PropertyStatus {
    return this.props.status;
  }

  get timezone(): string {
    return this.props.timezone;
  }

  get location(): Location {
    return this.props.location;
  }

  get policies(): PropertyPolicies {
    return this.props.policies;
  }

  get amenityIds(): string[] {
    return [...this.props.amenityIds];
  }

  get units(): Unit[] {
    return this._units.filter((u) => u.deletedAt === null);
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  static create(props: CreatePropertyProps): Property {
    if (!props.defaultUnit?.id) {
      throw new ValidationError("defaultUnit.id is required when creating a property");
    }

    const now = new Date();
    const propertyId = props.id;
    const defaultUnitId = props.defaultUnit.id;

    const unit = Unit.create({
      id: defaultUnitId,
      tenantId: props.tenantId,
      propertyId,
      name: "Entire Property",
      slug: "entire-property",
      maxGuests: props.defaultUnit?.maxGuests ?? 4,
      bedrooms: props.defaultUnit?.bedrooms ?? 1,
      bathrooms: props.defaultUnit?.bathrooms ?? 1,
    });

    const property = new Property({
      id: propertyId,
      tenantId: props.tenantId,
      name: props.name.trim(),
      slug: props.slug,
      description: props.description ?? null,
      type: props.type ?? "villa",
      status: "draft",
      timezone: props.timezone ?? "Europe/Athens",
      location: props.location ?? Location.empty(),
      policies: props.policies ?? PropertyPolicies.create(),
      amenityIds: [],
      units: [unit.toProps()],
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    property._units = [unit];

    property.addDomainEvent(
      new PropertyCreatedEvent(propertyId, props.tenantId, {
        slug: props.slug,
        name: props.name,
        defaultUnitId: unit.id,
      }),
    );

    return property;
  }

  static reconstitute(props: PropertyProps): Property {
    return new Property(props);
  }

  update(details: {
    name?: string;
    description?: string | null;
    type?: PropertyType;
    status?: PropertyStatus;
    timezone?: string;
    location?: Location;
    policies?: PropertyPolicies;
    amenityIds?: string[];
  }): void {
    const changedFields: string[] = [];

    if (details.name !== undefined) {
      this.props.name = details.name.trim();
      changedFields.push("name");
    }
    if (details.description !== undefined) {
      this.props.description = details.description;
      changedFields.push("description");
    }
    if (details.type !== undefined) {
      this.props.type = details.type;
      changedFields.push("type");
    }
    if (details.status !== undefined) {
      this.props.status = details.status;
      changedFields.push("status");
    }
    if (details.timezone !== undefined) {
      this.props.timezone = details.timezone;
      changedFields.push("timezone");
    }
    if (details.location !== undefined) {
      this.props.location = details.location;
      changedFields.push("location");
    }
    if (details.policies !== undefined) {
      this.props.policies = details.policies;
      changedFields.push("policies");
    }
    if (details.amenityIds !== undefined) {
      this.props.amenityIds = [...details.amenityIds];
      changedFields.push("amenityIds");
    }

    if (changedFields.length > 0) {
      this.props.updatedAt = new Date();
      this.addDomainEvent(
        new PropertyUpdatedEvent(this.id, this.props.tenantId, {
          changedFields,
        }),
      );
    }
  }

  addUnit(props: AddUnitProps): Unit {
    const unit = Unit.create({
      id: props.id,
      tenantId: this.props.tenantId,
      propertyId: this.id,
      name: props.name,
      slug: props.slug,
      maxGuests: props.maxGuests,
      bedrooms: props.bedrooms,
      bathrooms: props.bathrooms,
    });

    this._units.push(unit);
    this.syncUnits();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new UnitAddedEvent(unit.id, this.props.tenantId, {
        propertyId: this.id,
        name: unit.name,
      }),
    );

    return unit;
  }

  updateUnit(
    unitId: string,
    details: Partial<Pick<UnitProps, "name" | "maxGuests" | "bedrooms" | "bathrooms" | "status">>,
  ): Unit {
    const unit = this._units.find((u) => u.id === unitId && u.deletedAt === null);
    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }

    unit.update(details);
    this.syncUnits();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new UnitUpdatedEvent(unitId, this.props.tenantId, {
        propertyId: this.id,
        changedFields: Object.keys(details),
      }),
    );

    return unit;
  }

  removeUnit(unitId: string): void {
    const activeUnits = this._units.filter((u) => u.deletedAt === null);
    if (activeUnits.length <= 1) {
      throw new Error("Property must have at least one unit");
    }

    const unit = this._units.find((u) => u.id === unitId);
    if (!unit) {
      throw new Error(`Unit not found: ${unitId}`);
    }

    unit.archive();
    this.syncUnits();
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new UnitRemovedEvent(unitId, this.props.tenantId, {
        propertyId: this.id,
      }),
    );
  }

  archive(): void {
    this.props.status = "archived";
    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();
    this._units.forEach((u) => u.archive());
    this.syncUnits();
    this.addDomainEvent(
      new PropertyArchivedEvent(this.id, this.props.tenantId),
    );
  }

  private syncUnits(): void {
    this.props.units = this._units.map((u) => u.toProps());
  }

  toProps(): PropertyProps {
    this.syncUnits();
    return { ...this.props };
  }
}
