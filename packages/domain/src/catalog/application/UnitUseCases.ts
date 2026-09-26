import { Result } from "../../shared/kernel/Result";
import { PropertySlug } from "../../shared/value-objects/Slug";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { Unit } from "../domain/Unit";
import type { IPropertyRepository } from "../ports/ICatalogRepositories";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { IUnitHousekeepingStatusRepository } from "../../operations/ports/IUnitHousekeepingStatusRepository";

export interface AddUnitCommand {
  tenantId: string;
  propertyId: string;
  name: string;
  slug?: string;
  maxGuests: number;
  bedrooms?: number;
  bathrooms?: number;
}

export class AddUnitUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly housekeepingStatuses?: IUnitHousekeepingStatusRepository,
  ) {}

  async execute(
    command: AddUnitCommand,
    actor: ActorContext,
  ): Promise<Result<Unit, Error>> {
    try {
      const property = await this.propertyRepository.findById(
        command.tenantId,
        command.propertyId,
      );
      if (!property) {
        return Result.fail(new ValidationError("Property not found"));
      }

      if (
        !this.permissionChecker.canAccessProperty(
          actor,
          command.tenantId,
          command.propertyId,
          "property:update",
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const slug = command.slug
        ? PropertySlug.create(command.slug).value
        : PropertySlug.fromName(command.name).value;

      const unit = property.addUnit({
        id: this.idGenerator.generate(),
        name: command.name.trim(),
        slug,
        maxGuests: command.maxGuests,
        bedrooms: command.bedrooms,
        bathrooms: command.bathrooms,
      });

      await this.propertyRepository.save(property);

      if (this.housekeepingStatuses) {
        await this.housekeepingStatuses.ensureInitialized({
          tenantId: command.tenantId,
          propertyId: command.propertyId,
          unitId: unit.id,
        });
      }

      return Result.ok(unit);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface UpdateUnitCommand {
  tenantId: string;
  propertyId: string;
  unitId: string;
  name?: string;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  status?: "active" | "inactive" | "archived";
}

export class UpdateUnitUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: UpdateUnitCommand,
    actor: ActorContext,
  ): Promise<Result<Unit, Error>> {
    try {
      const property = await this.propertyRepository.findById(
        command.tenantId,
        command.propertyId,
      );
      if (!property) {
        return Result.fail(new ValidationError("Property not found"));
      }

      if (
        !this.permissionChecker.canAccessProperty(
          actor,
          command.tenantId,
          command.propertyId,
          "property:update",
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const unit = property.updateUnit(command.unitId, {
        name: command.name,
        maxGuests: command.maxGuests,
        bedrooms: command.bedrooms,
        bathrooms: command.bathrooms,
        status: command.status,
      });

      await this.propertyRepository.save(property);
      return Result.ok(unit);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface RemoveUnitCommand {
  tenantId: string;
  propertyId: string;
  unitId: string;
}

export class RemoveUnitUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: RemoveUnitCommand,
    actor: ActorContext,
  ): Promise<Result<void, Error>> {
    try {
      const property = await this.propertyRepository.findById(
        command.tenantId,
        command.propertyId,
      );
      if (!property) {
        return Result.fail(new ValidationError("Property not found"));
      }

      if (
        !this.permissionChecker.canAccessProperty(
          actor,
          command.tenantId,
          command.propertyId,
          "property:update",
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      property.removeUnit(command.unitId);
      await this.propertyRepository.save(property);
      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetUnitUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    propertyId: string,
    unitId: string,
    actor: ActorContext,
  ): Promise<Result<Unit, Error>> {
    try {
      const property = await this.propertyRepository.findById(tenantId, propertyId);
      if (!property) {
        return Result.fail(new ValidationError("Property not found"));
      }

      if (
        !this.permissionChecker.canAccessProperty(
          actor,
          tenantId,
          propertyId,
          "property:read",
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const unit = property.units.find((u) => u.id === unitId);
      if (!unit) {
        return Result.fail(new ValidationError("Unit not found"));
      }

      return Result.ok(unit);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
