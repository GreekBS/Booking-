import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { Guest } from "../domain/Guest";
import type {
  GuestProfileMetrics,
  IGuestRepository,
} from "../ports/IGuestRepository";
import type { IGuestTagRepository } from "../ports/IGuestTagRepository";
import { assertGuestReadable } from "./guestAccess";

export interface GuestProfileReadModel {
  guest: Guest;
  metrics: GuestProfileMetrics;
  tags: Array<{ id: string; name: string }>;
}

export class GetGuestProfileUseCase {
  constructor(
    private readonly guests: IGuestRepository,
    private readonly tags: IGuestTagRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; guestId: string },
    actor: ActorContext,
  ): Promise<Result<GuestProfileReadModel, Error>> {
    try {
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

      const guest = await this.guests.findById(input.tenantId, input.guestId);
      if (!guest) {
        return Result.fail(new ValidationError("Guest not found"));
      }

      const allowedPropertyIds =
        access === "tenant" ? null : (actor.propertyIds ?? []);

      const [metrics, tagList] = await Promise.all([
        this.guests.getVisibleStayMetrics(
          input.tenantId,
          input.guestId,
          allowedPropertyIds,
        ),
        this.tags.listForGuest(input.tenantId, input.guestId),
      ]);

      return Result.ok({ guest, metrics, tags: tagList });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
