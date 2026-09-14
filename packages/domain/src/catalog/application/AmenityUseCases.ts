import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type {
  AmenityRecord,
  IAmenityRepository,
} from "../ports/ICatalogRepositories";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";

export class ListAmenitiesUseCase {
  constructor(
    private readonly amenityRepository: IAmenityRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<AmenityRecord[], Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, "property:read:tenant", tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const amenities = await this.amenityRepository.findAll(tenantId);
      return Result.ok(amenities);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface CreateAmenityCommand {
  tenantId: string;
  name: string;
  icon?: string;
  category?: string;
}

export class CreateAmenityUseCase {
  constructor(
    private readonly amenityRepository: IAmenityRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: CreateAmenityCommand,
    actor: ActorContext,
  ): Promise<Result<AmenityRecord, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          "property:update:tenant",
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const name = command.name.trim();
      if (name.length < 2) {
        return Result.fail(new ValidationError("Amenity name is required"));
      }

      const amenity = await this.amenityRepository.saveCustom(
        command.tenantId,
        name,
        command.icon,
        command.category,
      );
      return Result.ok(amenity);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
