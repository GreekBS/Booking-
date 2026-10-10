import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/DomainError";
import type { Unit } from "../domain/Unit";
import type {
  IPropertyRepository,
  IRoomTypeRepository,
} from "../ports/ICatalogRepositories";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import type { IUnitHousekeepingStatusRepository } from "../../operations/ports/IUnitHousekeepingStatusRepository";
import { assertAssignableRoomType } from "./roomTypeAssignment";
import {
  MAX_BULK_CREATE_UNITS,
  planBulkPhysicalUnits,
  type BulkRoomNumbering,
  type PlannedPhysicalUnit,
} from "./roomInventoryPlanning";

export interface BulkCreateUnitsCommand {
  tenantId: string;
  propertyId: string;
  roomTypeId: string;
  numbering: BulkRoomNumbering;
  floor?: string | null;
  bedrooms?: number;
  bathrooms?: number;
  /**
   * When true, return the planned units without persisting.
   * Default false.
   */
  preview?: boolean;
  /**
   * Optional client correlation id for logs / future idempotency.
   * Durable admin idempotency store is not available in C3.
   */
  clientRequestId?: string | null;
}

export interface BulkCreateUnitsResult {
  preview: boolean;
  planned: PlannedPhysicalUnit[];
  units: Unit[];
  clientRequestId: string | null;
}

export class BulkCreateUnitsUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly roomTypeRepository: IRoomTypeRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly housekeepingStatuses?: IUnitHousekeepingStatusRepository,
  ) {}

  async execute(
    command: BulkCreateUnitsCommand,
    actor: ActorContext,
  ): Promise<Result<BulkCreateUnitsResult, Error>> {
    try {
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

      const assignment = await assertAssignableRoomType(this.roomTypeRepository, {
        tenantId: command.tenantId,
        propertyId: command.propertyId,
        roomTypeId: command.roomTypeId,
      });
      if (assignment.isFailure) return Result.fail(assignment.getError());

      const roomType = await this.roomTypeRepository.findById(
        command.tenantId,
        command.propertyId,
        command.roomTypeId,
      );
      if (!roomType || !roomType.isActive) {
        return Result.fail(new NotFoundError("RoomType", command.roomTypeId));
      }

      const property = await this.propertyRepository.findById(
        command.tenantId,
        command.propertyId,
      );
      if (!property) {
        return Result.fail(new NotFoundError("Property", command.propertyId));
      }

      const existingRoomNumbers = property.units
        .map((u) => u.roomNumber)
        .filter((n): n is string => !!n);
      const existingSlugs = property.units.map((u) => u.slug);

      const plannedResult = planBulkPhysicalUnits({
        roomTypeId: roomType.id,
        roomTypeName: roomType.name,
        maxGuests: roomType.maxGuests,
        bedrooms: command.bedrooms,
        bathrooms: command.bathrooms,
        floor: command.floor,
        numbering: command.numbering,
        existingRoomNumbers,
        existingSlugs,
      });
      if (plannedResult.isFailure) {
        return Result.fail(plannedResult.getError());
      }
      const planned = plannedResult.getValue();

      if (command.preview === true) {
        return Result.ok({
          preview: true,
          planned,
          units: [],
          clientRequestId: command.clientRequestId ?? null,
        });
      }

      const createdIds: string[] = [];
      let committedPlan: PlannedPhysicalUnit[] = planned;
      const updated = await this.propertyRepository.mutateUnderLock(
        command.tenantId,
        command.propertyId,
        (locked) => {
          // Re-check against the locked snapshot to close TOCTOU races.
          const lockedNumbers = new Set(
            locked.units
              .map((u) => u.roomNumber?.trim().toLowerCase())
              .filter((n): n is string => !!n),
          );
          const lockedSlugs = new Set(locked.units.map((u) => u.slug));

          const lockedPlan = planBulkPhysicalUnits({
            roomTypeId: roomType.id,
            roomTypeName: roomType.name,
            maxGuests: roomType.maxGuests,
            bedrooms: command.bedrooms,
            bathrooms: command.bathrooms,
            floor: command.floor,
            numbering: command.numbering,
            existingRoomNumbers: lockedNumbers,
            existingSlugs: lockedSlugs,
          });
          if (lockedPlan.isFailure) {
            throw lockedPlan.getError();
          }
          committedPlan = lockedPlan.getValue();

          for (const row of committedPlan) {
            const id = this.idGenerator.generate();
            locked.addUnit({
              id,
              name: row.name,
              slug: row.slug,
              maxGuests: row.maxGuests,
              bedrooms: row.bedrooms,
              bathrooms: row.bathrooms,
              roomTypeId: row.roomTypeId,
              roomNumber: row.roomNumber,
              floor: row.floor,
            });
            createdIds.push(id);
          }
        },
      );

      const units = updated.units.filter((u) => createdIds.includes(u.id));

      if (this.housekeepingStatuses) {
        for (const unit of units) {
          await this.housekeepingStatuses.ensureInitialized({
            tenantId: command.tenantId,
            propertyId: command.propertyId,
            unitId: unit.id,
          });
        }
      }

      return Result.ok({
        preview: false,
        planned: committedPlan,
        units,
        clientRequestId: command.clientRequestId ?? null,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export { MAX_BULK_CREATE_UNITS };
