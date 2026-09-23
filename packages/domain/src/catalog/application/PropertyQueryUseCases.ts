import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { Property } from "../domain/Property";
import type { IPropertyRepository } from "../ports/ICatalogRepositories";
import type {
  PaginatedResult,
  PaginationParams,
} from "../../shared/types/index";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";

export class GetPropertyUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    propertyId: string,
    actor: ActorContext,
  ): Promise<Result<Property, Error>> {
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

      return Result.ok(property);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListPropertiesUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    params: PaginationParams,
    actor: ActorContext,
  ): Promise<Result<PaginatedResult<Property>, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, "property:read:tenant", tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyIds =
        actor.role === "manager" && !actor.isSuperAdmin
          ? actor.propertyIds
          : null;

      const result = await this.propertyRepository.findAll(
        tenantId,
        params,
        propertyIds,
      );
      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/**
 * Slim property/unit catalog for dashboard pickers and filters.
 */
export class ListPropertyUnitCatalogUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<import("../types/PropertyUnitCatalog").PropertyUnitCatalogResult, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, "property:read:tenant", tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const propertyIds =
        actor.role === "manager" && !actor.isSuperAdmin
          ? actor.propertyIds
          : null;

      const result = await this.propertyRepository.listUnitCatalog(
        tenantId,
        propertyIds,
      );
      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
