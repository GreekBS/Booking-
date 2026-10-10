import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { Unit } from "../domain/Unit";
import type {
  IPropertyRepository,
  IRoomTypeRepository,
} from "../ports/ICatalogRepositories";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IOutboxRepository } from "../../shared/ports/InfrastructurePorts";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import type { IUnitHousekeepingStatusRepository } from "../../operations/ports/IUnitHousekeepingStatusRepository";
import type { IRatePlanRepository } from "../../commerce/ports/CommercePorts";
import type { RatePlanProps } from "../../commerce/shared/types/CommerceTypes";
import {
  assertPricedRatePlan,
  cloneRatePlanProps,
} from "../../commerce/pricing/ratePlanTemplate";
import { UnitExternalSyncRequiredEvent } from "../../channels/application/UnitExternalSyncRequiredEvent";
import { mutationOriginOperator } from "../../shared/types/MutationOrigin";
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
   * Optional Unit whose RatePlan is cloned onto every new Unit (C3-H2b).
   * Must belong to the same property and RoomType and carry a valid priced plan.
   */
  templateUnitId?: string | null;
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

/** Pricing summary returned when a template is validated (preview or create). */
export interface BulkCreatePricingTemplateSummary {
  templateUnitId: string;
  copiedFromTemplate: true;
  currency: string;
  baseNightlyAmount: string;
  seasons: RatePlanProps["seasons"];
  dowModifiers: RatePlanProps["dowModifiers"];
  seasonCount: number;
  dowModifierCount: number;
}

export interface BulkCreateUnitsResult {
  preview: boolean;
  planned: PlannedPhysicalUnit[];
  units: Unit[];
  clientRequestId: string | null;
  pricingTemplate: BulkCreatePricingTemplateSummary | null;
}

export class BulkCreateUnitsUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly roomTypeRepository: IRoomTypeRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly housekeepingStatuses?: IUnitHousekeepingStatusRepository,
    private readonly ratePlanRepository?: IRatePlanRepository,
    private readonly outboxRepository?: IOutboxRepository,
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

      const templateUnitId = command.templateUnitId?.trim() || null;
      let pricingTemplate: BulkCreatePricingTemplateSummary | null = null;
      let validatedTemplatePlan: RatePlanProps | null = null;

      if (templateUnitId) {
        const resolved = await this.resolveTemplatePlan({
          tenantId: command.tenantId,
          propertyId: command.propertyId,
          roomTypeId: command.roomTypeId,
          templateUnitId,
          propertyUnits: property.units,
        });
        if (resolved.isFailure) return Result.fail(resolved.getError());
        validatedTemplatePlan = resolved.getValue().plan;
        pricingTemplate = toPricingSummary(templateUnitId, validatedTemplatePlan);
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
          pricingTemplate,
        });
      }

      const createdIds: string[] = [];
      let committedPlan: PlannedPhysicalUnit[] = planned;
      let committedPricing = pricingTemplate;

      const updated = await this.propertyRepository.mutateUnderLock(
        command.tenantId,
        command.propertyId,
        (locked) => {
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
        templateUnitId
          ? async (locked) => {
              if (!this.ratePlanRepository || !this.outboxRepository) {
                throw new ValidationError(
                  "Rate plan template copy is not configured",
                );
              }

              // Re-resolve template under lock (TOCTOU).
              const revalidated = await this.resolveTemplatePlan({
                tenantId: command.tenantId,
                propertyId: command.propertyId,
                roomTypeId: command.roomTypeId,
                templateUnitId,
                propertyUnits: locked.units,
              });
              if (revalidated.isFailure) {
                throw revalidated.getError();
              }
              const sourcePlan = revalidated.getValue().plan;
              committedPricing = toPricingSummary(templateUnitId, sourcePlan);

              const syncFrom = new Date().toISOString().slice(0, 10);
              const toDate = new Date();
              toDate.setUTCDate(toDate.getUTCDate() + 365);
              const syncTo = toDate.toISOString().slice(0, 10);
              const revision = Date.now();
              const events: UnitExternalSyncRequiredEvent[] = [];

              for (const unitId of createdIds) {
                const existing = await this.ratePlanRepository.findByUnitId(
                  unitId,
                  command.tenantId,
                );
                if (existing) {
                  throw new ValidationError(
                    `Unit already has a rate plan: ${unitId}`,
                  );
                }

                const cloned = cloneRatePlanProps(sourcePlan, this.idGenerator);
                if (cloned.isFailure) {
                  throw cloned.getError();
                }

                await this.ratePlanRepository.save(
                  command.tenantId,
                  unitId,
                  cloned.getValue(),
                );

                events.push(
                  new UnitExternalSyncRequiredEvent({
                    tenantId: command.tenantId,
                    unitId,
                    propertyId: command.propertyId,
                    from: syncFrom,
                    to: syncTo,
                    changeKinds: ["rates"],
                    mutationOrigin: mutationOriginOperator(),
                    revision,
                    sourceEventId: `bulk-rate-plan:${unitId}:${revision}`,
                  }),
                );
              }

              await this.outboxRepository.saveEvents(events);
            }
          : undefined,
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
        pricingTemplate: committedPricing,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async resolveTemplatePlan(input: {
    tenantId: string;
    propertyId: string;
    roomTypeId: string;
    templateUnitId: string;
    propertyUnits: Unit[];
  }): Promise<Result<{ plan: RatePlanProps }, Error>> {
    if (!this.ratePlanRepository) {
      return Result.fail(
        new ValidationError("Rate plan template copy is not configured"),
      );
    }

    const templateUnit = input.propertyUnits.find(
      (u) => u.id === input.templateUnitId && u.deletedAt === null,
    );
    if (!templateUnit) {
      return Result.fail(new NotFoundError("Unit", input.templateUnitId));
    }

    if (templateUnit.propertyId !== input.propertyId) {
      return Result.fail(
        new ValidationError("Template unit must belong to the same property"),
      );
    }

    if (templateUnit.roomTypeId !== input.roomTypeId) {
      return Result.fail(
        new ValidationError(
          "Template unit must belong to the selected RoomType",
        ),
      );
    }

    if (templateUnit.status !== "active") {
      return Result.fail(
        new ValidationError("Template unit must be an active commercial unit"),
      );
    }

    const plan = await this.ratePlanRepository.findByUnitId(
      input.templateUnitId,
      input.tenantId,
    );
    if (!plan) {
      return Result.fail(
        new ValidationError("Template unit has no rate plan configured"),
      );
    }

    const priced = assertPricedRatePlan(plan);
    if (priced.isFailure) return Result.fail(priced.getError());

    return Result.ok({ plan: priced.getValue() });
  }
}

function toPricingSummary(
  templateUnitId: string,
  plan: RatePlanProps,
): BulkCreatePricingTemplateSummary {
  return {
    templateUnitId,
    copiedFromTemplate: true,
    currency: plan.currency,
    baseNightlyAmount: plan.baseNightlyAmount,
    seasons: plan.seasons.map((s) => ({ ...s })),
    dowModifiers: plan.dowModifiers.map((m) => ({ ...m })),
    seasonCount: plan.seasons.length,
    dowModifierCount: plan.dowModifiers.length,
  };
}

export { MAX_BULK_CREATE_UNITS };
