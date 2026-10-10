import { Result } from "../../shared/kernel/Result";
import { PropertySlug } from "../../shared/value-objects/Slug";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { Unit } from "../domain/Unit";
import type {
  IPropertyRepository,
  IRoomTypeRepository,
} from "../ports/ICatalogRepositories";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { IUnitHousekeepingStatusRepository } from "../../operations/ports/IUnitHousekeepingStatusRepository";
import { assertAssignableRoomType } from "./roomTypeAssignment";

export interface AddUnitCommand {
  tenantId: string;
  propertyId: string;
  name: string;
  slug?: string;
  maxGuests: number;
  bedrooms?: number;
  bathrooms?: number;
  roomTypeId?: string | null;
  roomNumber?: string | null;
  floor?: string | null;
}

export class AddUnitUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly housekeepingStatuses?: IUnitHousekeepingStatusRepository,
    private readonly roomTypeRepository?: IRoomTypeRepository,
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
        return Result.fail(new NotFoundError("Property", command.propertyId));
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

      let roomTypeId: string | null | undefined = command.roomTypeId;
      if (command.roomTypeId !== undefined) {
        if (!this.roomTypeRepository) {
          return Result.fail(
            new ValidationError("RoomType assignment is not available"),
          );
        }
        const assignment = await assertAssignableRoomType(this.roomTypeRepository, {
          tenantId: command.tenantId,
          propertyId: command.propertyId,
          roomTypeId: command.roomTypeId,
        });
        if (assignment.isFailure) return Result.fail(assignment.getError());
        roomTypeId = assignment.getValue().roomTypeId;
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
        roomTypeId,
        roomNumber: command.roomNumber,
        floor: command.floor,
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
  roomTypeId?: string | null;
  roomNumber?: string | null;
  floor?: string | null;
}

export class UpdateUnitUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly roomTypeRepository?: IRoomTypeRepository,
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
        return Result.fail(new NotFoundError("Property", command.propertyId));
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

      let roomTypeId = command.roomTypeId;
      if (command.roomTypeId !== undefined) {
        if (!this.roomTypeRepository) {
          return Result.fail(
            new ValidationError("RoomType assignment is not available"),
          );
        }
        const assignment = await assertAssignableRoomType(this.roomTypeRepository, {
          tenantId: command.tenantId,
          propertyId: command.propertyId,
          roomTypeId: command.roomTypeId,
        });
        if (assignment.isFailure) return Result.fail(assignment.getError());
        roomTypeId = assignment.getValue().roomTypeId;
      }

      const unit = property.updateUnit(command.unitId, {
        name: command.name,
        maxGuests: command.maxGuests,
        bedrooms: command.bedrooms,
        bathrooms: command.bathrooms,
        status: command.status,
        roomTypeId,
        roomNumber: command.roomNumber,
        floor: command.floor,
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
        return Result.fail(new NotFoundError("Property", command.propertyId));
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
        return Result.fail(new NotFoundError("Property", propertyId));
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
        return Result.fail(new NotFoundError("Unit", unitId));
      }

      return Result.ok(unit);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
