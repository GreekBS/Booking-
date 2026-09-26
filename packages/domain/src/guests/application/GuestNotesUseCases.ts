import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { GuestNote } from "../domain/GuestNote";
import type { IGuestNoteRepository } from "../ports/IGuestNoteRepository";
import type { IGuestRepository } from "../ports/IGuestRepository";
import { assertGuestReadable } from "./guestAccess";

function resolveNoteListVisibility(
  access: "tenant" | "assigned",
  actor: ActorContext,
): { includeTenantWide: boolean; visiblePropertyIds: string[] | null } {
  if (access === "tenant") {
    return { includeTenantWide: true, visiblePropertyIds: null };
  }
  return {
    includeTenantWide: false,
    visiblePropertyIds: actor.propertyIds ?? [],
  };
}

async function requireGuestNoteReadAccess(
  guests: IGuestRepository,
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
  guestId: string,
): Promise<"tenant" | "assigned" | "forbidden"> {
  return assertGuestReadable({
    permissionChecker,
    actor,
    tenantId,
    guestId,
    hasVisibleActivity: (allowedPropertyIds) =>
      guests.hasVisibleBookingActivity(tenantId, guestId, allowedPropertyIds),
  });
}

export class ListGuestNotesUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly notes: IGuestNoteRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; guestId: string },
    actor: ActorContext,
  ): Promise<Result<GuestNote[], Error>> {
    try {
      const access = await requireGuestNoteReadAccess(
        this.guests,
        this.permissionChecker,
        actor,
        input.tenantId,
        input.guestId,
      );
      if (access === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const visibility = resolveNoteListVisibility(access, actor);
      const list = await this.notes.listForGuest({
        tenantId: input.tenantId,
        guestId: input.guestId,
        ...visibility,
      });
      return Result.ok(list);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class AddGuestNoteUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly notes: IGuestNoteRepository,
    private readonly ids: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: {
      tenantId: string;
      guestId: string;
      body: string;
      propertyId?: string | null;
    },
    actor: ActorContext,
  ): Promise<Result<GuestNote, Error>> {
    try {
      const access = await requireGuestNoteReadAccess(
        this.guests,
        this.permissionChecker,
        actor,
        input.tenantId,
        input.guestId,
      );
      if (access === "forbidden") {
        return Result.fail(new ForbiddenError());
      }

      const tenantWideCreate = this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.GUEST_NOTE_CREATE_TENANT,
        input.tenantId,
      );
      const assignedCreate = this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.GUEST_NOTE_CREATE_ASSIGNED,
        input.tenantId,
      );

      const propertyId = input.propertyId?.trim() || null;

      if (tenantWideCreate) {
        // Admin: tenant-wide (null) or any property.
      } else if (assignedCreate) {
        if (!propertyId) {
          return Result.fail(
            new ValidationError("Property-scoped note requires propertyId"),
          );
        }
        if (!(actor.propertyIds ?? []).includes(propertyId)) {
          return Result.fail(new ForbiddenError());
        }
      } else {
        return Result.fail(new ForbiddenError());
      }

      const guest = await this.guests.findById(input.tenantId, input.guestId);
      if (!guest) {
        return Result.fail(new ValidationError("Guest not found"));
      }

      const note = GuestNote.create({
        id: this.ids.generate(),
        tenantId: input.tenantId,
        guestId: input.guestId,
        authorUserId: actor.userId,
        propertyId,
        body: input.body,
      });

      await this.notes.save(note);
      return Result.ok(note);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
