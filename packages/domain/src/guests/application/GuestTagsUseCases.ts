import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { GuestTag } from "../domain/GuestTag";
import type { IGuestRepository } from "../ports/IGuestRepository";
import type { IGuestTagRepository } from "../ports/IGuestTagRepository";
import { assertGuestReadable } from "./guestAccess";

function canReadGuests(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): boolean {
  return (
    permissionChecker.hasPermission(actor, PERMISSIONS.GUEST_READ_TENANT, tenantId) ||
    permissionChecker.hasPermission(actor, PERMISSIONS.GUEST_READ_ASSIGNED, tenantId)
  );
}

function canManageTags(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): boolean {
  return permissionChecker.hasPermission(
    actor,
    PERMISSIONS.GUEST_TAG_MANAGE_TENANT,
    tenantId,
  );
}

export class ListGuestTagsUseCase {
  constructor(
    private readonly tags: IGuestTagRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  /** Active tag definitions for pickers; any Guest reader. */
  async execute(
    input: { tenantId: string },
    actor: ActorContext,
  ): Promise<Result<GuestTag[], Error>> {
    try {
      if (!canReadGuests(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }
      return Result.ok(await this.tags.listActive(input.tenantId));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class CreateGuestTagUseCase {
  constructor(
    private readonly tags: IGuestTagRepository,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; name: string },
    actor: ActorContext,
  ): Promise<Result<GuestTag, Error>> {
    try {
      if (!canManageTags(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }

      const tag = GuestTag.create({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        name: input.name,
      });
      await this.tags.save(tag);
      return Result.ok(tag);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class AssignGuestTagUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly tags: IGuestTagRepository,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; guestId: string; tagId: string },
    actor: ActorContext,
  ): Promise<Result<{ assigned: boolean; alreadyAssigned: boolean }, Error>> {
    try {
      if (!canManageTags(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }

      const access = await assertGuestReadable({
        permissionChecker: this.permissionChecker,
        actor,
        tenantId: input.tenantId,
        guestId: input.guestId,
        hasVisibleActivity: (allowedPropertyIds) =>
          this.guests.hasVisibleBookingActivity(
            input.tenantId,
            input.guestId,
            allowedPropertyIds,
          ),
      });
      if (access === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const tag = await this.tags.findById(input.tenantId, input.tagId);
      if (!tag || !tag.isActive) {
        return Result.fail(new ValidationError("Guest tag not found"));
      }

      const result = await this.tags.assign({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        guestId: input.guestId,
        tagId: input.tagId,
        assignedByUserId: actor.userId,
      });

      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class UnassignGuestTagUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly tags: IGuestTagRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; guestId: string; tagId: string },
    actor: ActorContext,
  ): Promise<Result<{ removed: boolean }, Error>> {
    try {
      if (!canManageTags(this.permissionChecker, actor, input.tenantId)) {
        return Result.fail(new ForbiddenError());
      }

      const access = await assertGuestReadable({
        permissionChecker: this.permissionChecker,
        actor,
        tenantId: input.tenantId,
        guestId: input.guestId,
        hasVisibleActivity: (allowedPropertyIds) =>
          this.guests.hasVisibleBookingActivity(
            input.tenantId,
            input.guestId,
            allowedPropertyIds,
          ),
      });
      if (access === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const removed = await this.tags.unassign({
        tenantId: input.tenantId,
        guestId: input.guestId,
        tagId: input.tagId,
      });
      return Result.ok(removed);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
