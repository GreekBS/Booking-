import {
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import { Result } from "../../shared/kernel/Result";
import type { IRoomTypeRepository } from "../ports/ICatalogRepositories";

/**
 * Ensures a Unit may only reference an active, non-deleted RoomType on the
 * same tenant + property. Null clears the assignment.
 */
export async function assertAssignableRoomType(
  roomTypes: IRoomTypeRepository,
  input: {
    tenantId: string;
    propertyId: string;
    roomTypeId: string | null | undefined;
  },
): Promise<Result<{ roomTypeId: string | null }, Error>> {
  if (input.roomTypeId === undefined) {
    return Result.ok({ roomTypeId: null });
  }
  if (input.roomTypeId === null) {
    return Result.ok({ roomTypeId: null });
  }

  const roomType = await roomTypes.findById(
    input.tenantId,
    input.propertyId,
    input.roomTypeId,
  );
  if (!roomType || roomType.deletedAt) {
    return Result.fail(new NotFoundError("RoomType", input.roomTypeId));
  }
  if (roomType.status !== "active") {
    return Result.fail(
      new ValidationError("Cannot assign an inactive RoomType to a Unit"),
    );
  }
  if (
    roomType.tenantId !== input.tenantId ||
    roomType.propertyId !== input.propertyId
  ) {
    return Result.fail(
      new ValidationError("RoomType must belong to the same property"),
    );
  }

  return Result.ok({ roomTypeId: roomType.id });
}
