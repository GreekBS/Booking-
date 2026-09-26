import { Result } from "../../shared/kernel/Result";
import { PropertySlug } from "../../shared/value-objects/Slug";
import { Location } from "../../shared/value-objects/Location";
import { PropertyPolicies } from "../../shared/value-objects/Policies";
import { ConflictError, ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import { Property } from "../domain/Property";
import type { IPropertyRepository } from "../ports/ICatalogRepositories";
import type { PropertyType } from "../../shared/types/index";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { IUnitHousekeepingStatusRepository } from "../../operations/ports/IUnitHousekeepingStatusRepository";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";

export interface CreatePropertyCommand {
  tenantId: string;
  name: string;
  slug?: string;
  description?: string | null;
  type?: PropertyType;
  timezone?: string;
  maxGuests?: number;
}

export class CreatePropertyUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly housekeepingStatuses?: IUnitHousekeepingStatusRepository,
  ) {}

  async execute(
    command: CreatePropertyCommand,
    actor: ActorContext,
  ): Promise<Result<Property, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, "property:create:tenant", command.tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const name = command.name.trim();
      if (name.length < 2) {
        return Result.fail(new ValidationError("Property name is required"));
      }

      const slug = command.slug
        ? PropertySlug.create(command.slug)
        : PropertySlug.fromName(name);

      const exists = await this.propertyRepository.existsBySlug(
        command.tenantId,
        slug.value,
      );
      if (exists) {
        return Result.fail(
          new ConflictError(`Property slug already exists: ${slug.value}`),
        );
      }

      const property = Property.create({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        name,
        slug: slug.value,
        description: command.description,
        type: command.type,
        timezone: command.timezone,
        defaultUnit: {
          id: this.idGenerator.generate(),
          maxGuests: command.maxGuests ?? 4,
        },
      });

      await this.propertyRepository.save(property);

      if (this.housekeepingStatuses) {
        for (const unit of property.units) {
          await this.housekeepingStatuses.ensureInitialized({
            tenantId: command.tenantId,
            propertyId: property.id,
            unitId: unit.id,
          });
        }
      }

      return Result.ok(property);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface UpdatePropertyCommand {
  tenantId: string;
  propertyId: string;
  name?: string;
  description?: string | null;
  type?: PropertyType;
  status?: "draft" | "active" | "inactive" | "archived";
  timezone?: string;
  location?: {
    addressLine?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  policies?: {
    checkInTime?: string;
    checkOutTime?: string;
    cancellationPolicyType?: "flexible" | "moderate" | "strict";
  };
  amenityIds?: string[];
}

export class UpdatePropertyUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: UpdatePropertyCommand,
    actor: ActorContext,
  ): Promise<Result<Property, Error>> {
    try {
      const property = await this.propertyRepository.findById(
        command.tenantId,
        command.propertyId,
      );
      if (!property) {
        return Result.fail(new ValidationError("Property not found"));
      }

      if (
        !this.permissionChecker.canAccessProperty(actor, command.tenantId, command.propertyId, "property:update")
      ) {
        return Result.fail(new ForbiddenError());
      }

      property.update({
        name: command.name,
        description: command.description,
        type: command.type,
        status: command.status,
        timezone: command.timezone,
        location: command.location
          ? Location.create({
              addressLine: command.location.addressLine ?? null,
              city: command.location.city ?? null,
              region: command.location.region ?? null,
              postalCode: command.location.postalCode ?? null,
              country: command.location.country ?? null,
              latitude: command.location.latitude ?? null,
              longitude: command.location.longitude ?? null,
            })
          : undefined,
        policies: command.policies
          ? PropertyPolicies.create({
              checkInTime: command.policies.checkInTime,
              checkOutTime: command.policies.checkOutTime,
              cancellationPolicyType: command.policies.cancellationPolicyType,
            })
          : undefined,
        amenityIds: command.amenityIds,
      });

      await this.propertyRepository.save(property);
      return Result.ok(property);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
