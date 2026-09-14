import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { Property } from "../domain/Property";
import type { IPropertyRepository } from "../ports/ICatalogRepositories";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";

export interface ArchivePropertyCommand {
  tenantId: string;
  propertyId: string;
}

export class ArchivePropertyUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: ArchivePropertyCommand,
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
        !this.permissionChecker.hasPermission(
          actor,
          "property:delete:tenant",
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      property.archive();
      await this.propertyRepository.save(property);
      return Result.ok(property);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
