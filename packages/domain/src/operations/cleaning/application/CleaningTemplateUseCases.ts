import { Result } from "../../../shared/kernel/Result";
import {
  ForbiddenError,
  ValidationError,
} from "../../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../../shared/services/PermissionChecker";
import type { IAuditLogRepository } from "../../../shared/ports/InfrastructurePorts";
import {
  CLEANING_TEMPLATE_MAX_ITEMS,
  CLEANING_TEMPLATE_MAX_MINIMUM_PHOTOS,
  type CleaningChecklistTemplateRecord,
  type UpsertChecklistTemplateItemInput,
} from "../domain/CleaningTypes";
import type { ICleaningChecklistRepository } from "../ports/ICleaningChecklistRepository";
import {
  canManageCleaningConfigOnProperty,
  canReadCleaningOnProperty,
} from "./cleaningAccess";
import type { AuditIpContext } from "../../application/TaskUseCases";

export class GetCleaningChecklistTemplateUseCase {
  constructor(
    private readonly checklists: ICleaningChecklistRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: { tenantId: string; propertyId: string },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningChecklistTemplateRecord, Error>> {
    try {
      if (
        !canReadCleaningOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const ensured = await this.checklists.ensureDefaultActiveTemplate({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        actorUserId: actor.userId,
      });

      if (ensured.created) {
        await this.audit?.append({
          tenantId: input.tenantId,
          actorId: actor.userId,
          action: "cleaning_checklist.default_ensured",
          resourceType: "cleaning_checklist_template",
          resourceId: ensured.template.id,
          metadata: {
            propertyId: input.propertyId,
            version: ensured.template.version,
            itemCount: ensured.template.items.filter((i) => i.isActive).length,
          },
          ipAddress: auditContext?.ipAddress ?? null,
        });
      }

      return Result.ok(ensured.template);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class UpsertCleaningChecklistTemplateUseCase {
  constructor(
    private readonly checklists: ICleaningChecklistRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      propertyId: string;
      name: string;
      minimumCompletionPhotos: number;
      items: UpsertChecklistTemplateItemInput[];
    },
    actor: ActorContext,
    auditContext?: AuditIpContext,
  ): Promise<Result<CleaningChecklistTemplateRecord, Error>> {
    try {
      if (
        !canManageCleaningConfigOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const name = input.name.trim();
      if (!name) {
        return Result.fail(new ValidationError("Checklist name is required"));
      }
      if (input.items.length === 0) {
        return Result.fail(
          new ValidationError("A checklist needs at least one item"),
        );
      }
      if (input.items.length > CLEANING_TEMPLATE_MAX_ITEMS) {
        return Result.fail(
          new ValidationError(
            `A checklist cannot exceed ${CLEANING_TEMPLATE_MAX_ITEMS} items`,
          ),
        );
      }
      if (
        input.minimumCompletionPhotos < 0 ||
        input.minimumCompletionPhotos > CLEANING_TEMPLATE_MAX_MINIMUM_PHOTOS
      ) {
        return Result.fail(
          new ValidationError("Minimum completion photos out of range"),
        );
      }
      if (input.items.some((item) => !item.label.trim())) {
        return Result.fail(new ValidationError("Checklist item labels cannot be empty"));
      }

      const template = await this.checklists.upsertActiveTemplate({
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        name,
        minimumCompletionPhotos: input.minimumCompletionPhotos,
        items: input.items,
        actorUserId: actor.userId,
      });

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "cleaning_checklist.saved",
        resourceType: "cleaning_checklist_template",
        resourceId: template.id,
        metadata: {
          propertyId: input.propertyId,
          version: template.version,
          itemCount: template.items.filter((i) => i.isActive).length,
          minimumCompletionPhotos: template.minimumCompletionPhotos,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(template);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
