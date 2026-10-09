import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/DomainError";
import { RoomType } from "../domain/RoomType";
import type {
  IPropertyRepository,
  IRoomTypeRepository,
} from "../ports/ICatalogRepositories";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type {
  PermissionChecker,
  ActorContext,
} from "../../shared/services/PermissionChecker";
import type { RoomTypeStatus } from "../../shared/types/index";

async function requirePropertyAccess(
  propertyRepository: IPropertyRepository,
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  propertyId: string,
  action: "property:read" | "property:update",
): Promise<Result<true, Error>> {
  const property = await propertyRepository.findById(tenantId, propertyId);
  if (!property) {
    return Result.fail(new NotFoundError("Property", propertyId));
  }
  if (!permissionChecker.canAccessProperty(actor, tenantId, propertyId, action)) {
    return Result.fail(new ForbiddenError());
  }
  return Result.ok(true);
}

export interface CreateRoomTypeCommand {
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

export class CreateRoomTypeUseCase {
  constructor(
    private readonly roomTypeRepository: IRoomTypeRepository,
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: CreateRoomTypeCommand,
    actor: ActorContext,
  ): Promise<Result<RoomType, Error>> {
    try {
      const access = await requirePropertyAccess(
        this.propertyRepository,
        this.permissionChecker,
        actor,
        command.tenantId,
        command.propertyId,
        "property:update",
      );
      if (access.isFailure) return Result.fail(access.getError());

      const roomType = RoomType.create({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        propertyId: command.propertyId,
        name: command.name,
        code: command.code,
        description: command.description,
        maxGuests: command.maxGuests,
        maxAdults: command.maxAdults,
        maxChildren: command.maxChildren,
        status: command.status,
        sortOrder: command.sortOrder,
      });

      await this.roomTypeRepository.save(roomType);
      return Result.ok(roomType);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface ListRoomTypesCommand {
  tenantId: string;
  propertyId: string;
  includeDeleted?: boolean;
}

export class ListRoomTypesUseCase {
  constructor(
    private readonly roomTypeRepository: IRoomTypeRepository,
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: ListRoomTypesCommand,
    actor: ActorContext,
  ): Promise<Result<RoomType[], Error>> {
    try {
      const access = await requirePropertyAccess(
        this.propertyRepository,
        this.permissionChecker,
        actor,
        command.tenantId,
        command.propertyId,
        "property:read",
      );
      if (access.isFailure) return Result.fail(access.getError());

      const items = await this.roomTypeRepository.listByProperty(
        command.tenantId,
        command.propertyId,
        { includeDeleted: command.includeDeleted === true },
      );
      return Result.ok(items);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetRoomTypeUseCase {
  constructor(
    private readonly roomTypeRepository: IRoomTypeRepository,
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    propertyId: string,
    roomTypeId: string,
    actor: ActorContext,
  ): Promise<Result<RoomType, Error>> {
    try {
      const access = await requirePropertyAccess(
        this.propertyRepository,
        this.permissionChecker,
        actor,
        tenantId,
        propertyId,
        "property:read",
      );
      if (access.isFailure) return Result.fail(access.getError());

      const roomType = await this.roomTypeRepository.findById(
        tenantId,
        propertyId,
        roomTypeId,
      );
      if (!roomType || roomType.deletedAt) {
        return Result.fail(new NotFoundError("RoomType", roomTypeId));
      }
      return Result.ok(roomType);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface UpdateRoomTypeCommand {
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  name?: string;
  code?: string | null;
  description?: string | null;
  maxGuests?: number;
  maxAdults?: number | null;
  maxChildren?: number | null;
  status?: RoomTypeStatus;
  sortOrder?: number;
}

export class UpdateRoomTypeUseCase {
  constructor(
    private readonly roomTypeRepository: IRoomTypeRepository,
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: UpdateRoomTypeCommand,
    actor: ActorContext,
  ): Promise<Result<RoomType, Error>> {
    try {
      const access = await requirePropertyAccess(
        this.propertyRepository,
        this.permissionChecker,
        actor,
        command.tenantId,
        command.propertyId,
        "property:update",
      );
      if (access.isFailure) return Result.fail(access.getError());

      const roomType = await this.roomTypeRepository.findById(
        command.tenantId,
        command.propertyId,
        command.roomTypeId,
      );
      if (!roomType || roomType.deletedAt) {
        return Result.fail(new NotFoundError("RoomType", command.roomTypeId));
      }

      roomType.update({
        name: command.name,
        code: command.code,
        description: command.description,
        maxGuests: command.maxGuests,
        maxAdults: command.maxAdults,
        maxChildren: command.maxChildren,
        status: command.status,
        sortOrder: command.sortOrder,
      });

      await this.roomTypeRepository.save(roomType);
      return Result.ok(roomType);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface DeactivateRoomTypeCommand {
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
}

export interface DeactivateRoomTypeResult {
  roomType: RoomType;
  linkedUnitCount: number;
}

/**
 * Soft-deactivates a RoomType. Linked Units keep their roomTypeId
 * (hard delete is forbidden by DB FK ON DELETE RESTRICT).
 */
export class DeactivateRoomTypeUseCase {
  constructor(
    private readonly roomTypeRepository: IRoomTypeRepository,
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: DeactivateRoomTypeCommand,
    actor: ActorContext,
  ): Promise<Result<DeactivateRoomTypeResult, Error>> {
    try {
      const access = await requirePropertyAccess(
        this.propertyRepository,
        this.permissionChecker,
        actor,
        command.tenantId,
        command.propertyId,
        "property:update",
      );
      if (access.isFailure) return Result.fail(access.getError());

      const roomType = await this.roomTypeRepository.findById(
        command.tenantId,
        command.propertyId,
        command.roomTypeId,
      );
      if (!roomType || roomType.deletedAt) {
        return Result.fail(new NotFoundError("RoomType", command.roomTypeId));
      }

      const linkedUnitCount = await this.roomTypeRepository.countLinkedUnits(
        command.tenantId,
        command.propertyId,
        command.roomTypeId,
      );

      roomType.deactivate();
      await this.roomTypeRepository.save(roomType);

      return Result.ok({ roomType, linkedUnitCount });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
