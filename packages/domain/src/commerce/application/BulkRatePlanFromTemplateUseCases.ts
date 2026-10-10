import { PERMISSIONS } from "@hcp/permissions";
import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { ActorContext, PermissionChecker } from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository, IOutboxRepository } from "../../shared/ports/InfrastructurePorts";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import type { Unit } from "../../catalog/domain/Unit";
import type { IRatePlanRepository } from "../ports/CommercePorts";
import type { RatePlanProps } from "../shared/types/CommerceTypes";
import {
  assertPricedRatePlan,
  cloneRatePlanProps,
} from "../pricing/ratePlanTemplate";
import {
  ratePlanContentFingerprint,
  ratePlansContentEqual,
} from "../pricing/ratePlanContentFingerprint";
import { UnitExternalSyncRequiredEvent } from "../../channels/application/UnitExternalSyncRequiredEvent";
import { mutationOriginOperator } from "../../shared/types/MutationOrigin";
import { assertCommercePropertyAccess } from "./commerceAccess";
import type {
  BulkRatePlanConfirmClaims,
  BulkRatePlanPropagateMode,
  IBulkRatePlanConfirmTokenService,
  TargetRateFingerprint,
} from "./BulkRatePlanConfirmToken";

export interface RatePlanPricingSummary {
  currency: string;
  baseNightlyAmount: string;
  seasonCount: number;
  dowModifierCount: number;
  fingerprint: string;
  seasons: RatePlanProps["seasons"];
  dowModifiers: RatePlanProps["dowModifiers"];
}

export type BulkRateTargetDecision =
  | "apply_create"
  | "apply_overwrite"
  | "skip_identical"
  | "skip_protected";

export interface BulkRateTargetPreview {
  unitId: string;
  unitName: string;
  roomNumber: string | null;
  decision: BulkRateTargetDecision;
  current: RatePlanPricingSummary | null;
  proposed: RatePlanPricingSummary;
  warning: string | null;
}

export interface PreviewBulkRatePlanFromTemplateCommand {
  tenantId: string;
  propertyId: string;
  sourceUnitId: string;
  /** Explicit targets XOR roomTypeId selection. */
  targetUnitIds?: string[] | null;
  roomTypeId?: string | null;
  mode: BulkRatePlanPropagateMode;
}

export interface PreviewBulkRatePlanFromTemplateResult {
  sourceUnitId: string;
  roomTypeId: string;
  mode: BulkRatePlanPropagateMode;
  source: RatePlanPricingSummary;
  targets: BulkRateTargetPreview[];
  applyCount: number;
  skipCount: number;
  overwriteCount: number;
  /**
   * Conservative policy note: without provenance, any different RatePlan is
   * treated as protected under skip_customized.
   */
  customizationPolicy: "conservative_content_diff";
  confirmationToken: string;
  confirmationExpiresAt: string;
}

export interface ApplyBulkRatePlanFromTemplateCommand {
  tenantId: string;
  propertyId: string;
  confirmationToken: string;
  /**
   * Required when token mode is overwrite_all — operator must re-affirm.
   */
  confirmOverwrite?: boolean;
}

export interface ApplyBulkRatePlanFromTemplateResult {
  appliedUnitIds: string[];
  skippedUnitIds: string[];
  mode: BulkRatePlanPropagateMode;
  sourceUnitId: string;
  confirmationReference: string;
}

function toSummary(plan: RatePlanProps): RatePlanPricingSummary {
  return {
    currency: plan.currency,
    baseNightlyAmount: plan.baseNightlyAmount,
    seasonCount: plan.seasons.length,
    dowModifierCount: plan.dowModifiers.length,
    fingerprint: ratePlanContentFingerprint(plan),
    seasons: plan.seasons.map((s) => ({ ...s })),
    dowModifiers: plan.dowModifiers.map((m) => ({ ...m })),
  };
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort();
}

export class PreviewBulkRatePlanFromTemplateUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly ratePlanRepository: IRatePlanRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly confirmTokens: IBulkRatePlanConfirmTokenService,
  ) {}

  async execute(
    command: PreviewBulkRatePlanFromTemplateCommand,
    actor: ActorContext,
  ): Promise<Result<PreviewBulkRatePlanFromTemplateResult, Error>> {
    try {
      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        command.tenantId,
        command.propertyId,
        PERMISSIONS.PRICING_READ_TENANT,
        PERMISSIONS.PRICING_READ_ASSIGNED,
      );

      const built = await this.buildPreview(command, actor.userId);
      if (built.isFailure) return Result.fail(built.getError());

      const { payload, claimsInput } = built.getValue();
      const { token, claims } = this.confirmTokens.issue(claimsInput);

      return Result.ok({
        ...payload,
        confirmationToken: token,
        confirmationExpiresAt: new Date(claims.exp * 1000).toISOString(),
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Shared selection/validation used by preview and apply revalidation. */
  async buildPreview(
    command: PreviewBulkRatePlanFromTemplateCommand,
    actorId: string,
  ): Promise<
    Result<
      {
        payload: Omit<
          PreviewBulkRatePlanFromTemplateResult,
          "confirmationToken" | "confirmationExpiresAt"
        >;
        claimsInput: Omit<
          BulkRatePlanConfirmClaims,
          "typ" | "v" | "iat" | "exp"
        >;
        sourcePlan: RatePlanProps;
        applyUnitIds: string[];
      },
      Error
    >
  > {
    const property = await this.propertyRepository.findById(
      command.tenantId,
      command.propertyId,
    );
    if (!property) {
      return Result.fail(new NotFoundError("Property", command.propertyId));
    }

    const sourceUnit = property.units.find(
      (u) => u.id === command.sourceUnitId && u.deletedAt === null,
    );
    if (!sourceUnit) {
      return Result.fail(new NotFoundError("Unit", command.sourceUnitId));
    }
    if (sourceUnit.status !== "active") {
      return Result.fail(
        new ValidationError("Source unit must be an active commercial unit"),
      );
    }
    if (!sourceUnit.roomTypeId) {
      return Result.fail(
        new ValidationError("Source unit must belong to a RoomType"),
      );
    }

    const targetIds = resolveTargetIds(command, property.units, sourceUnit.roomTypeId);
    if (targetIds.isFailure) return Result.fail(targetIds.getError());

    const sourcePlanRaw = await this.ratePlanRepository.findByUnitId(
      command.sourceUnitId,
      command.tenantId,
    );
    if (!sourcePlanRaw) {
      return Result.fail(
        new ValidationError("Source unit has no rate plan configured"),
      );
    }
    const sourcePriced = assertPricedRatePlan(sourcePlanRaw);
    if (sourcePriced.isFailure) return Result.fail(sourcePriced.getError());
    const sourcePlan = sourcePriced.getValue();
    const sourceSummary = toSummary(sourcePlan);

    const targets: BulkRateTargetPreview[] = [];
    const targetFingerprints: Record<string, TargetRateFingerprint> = {};
    const applyUnitIds: string[] = [];
    const skipUnitIds: string[] = [];

    for (const unitId of targetIds.getValue()) {
      const unit = property.units.find((u) => u.id === unitId)!;
      if (unit.roomTypeId !== sourceUnit.roomTypeId) {
        return Result.fail(
          new ValidationError("All target units must share the source RoomType"),
        );
      }
      if (unit.status !== "active") {
        return Result.fail(
          new ValidationError(`Target unit is not active: ${unitId}`),
        );
      }

      const currentRaw = await this.ratePlanRepository.findByUnitId(
        unitId,
        command.tenantId,
      );
      const proposed = sourceSummary;
      let decision: BulkRateTargetDecision;
      let warning: string | null = null;
      let current: RatePlanPricingSummary | null = null;

      if (!currentRaw) {
        decision = "apply_create";
        targetFingerprints[unitId] = "missing";
        applyUnitIds.push(unitId);
      } else if (ratePlansContentEqual(currentRaw, sourcePlan)) {
        decision = "skip_identical";
        current = toSummary(currentRaw);
        targetFingerprints[unitId] = current.fingerprint;
        skipUnitIds.push(unitId);
      } else if (command.mode === "skip_customized") {
        decision = "skip_protected";
        current = toSummary(currentRaw);
        targetFingerprints[unitId] = current.fingerprint;
        skipUnitIds.push(unitId);
        warning =
          "Existing pricing differs from template; protected by skip_customized";
      } else {
        decision = "apply_overwrite";
        current = toSummary(currentRaw);
        targetFingerprints[unitId] = current.fingerprint;
        applyUnitIds.push(unitId);
        warning =
          "Existing pricing will be overwritten; confirmOverwrite required on apply";
      }

      targets.push({
        unitId,
        unitName: unit.name,
        roomNumber: unit.roomNumber,
        decision,
        current,
        proposed,
        warning,
      });
    }

    const overwriteCount = targets.filter(
      (t) => t.decision === "apply_overwrite",
    ).length;

    const payload = {
      sourceUnitId: command.sourceUnitId,
      roomTypeId: sourceUnit.roomTypeId,
      mode: command.mode,
      source: sourceSummary,
      targets,
      applyCount: applyUnitIds.length,
      skipCount: skipUnitIds.length,
      overwriteCount,
      customizationPolicy: "conservative_content_diff" as const,
    };

    const claimsInput = {
      tenantId: command.tenantId,
      propertyId: command.propertyId,
      sourceUnitId: command.sourceUnitId,
      roomTypeId: sourceUnit.roomTypeId,
      targetUnitIds: targetIds.getValue(),
      mode: command.mode,
      sourceFingerprint: sourceSummary.fingerprint,
      targetFingerprints,
      applyUnitIds: [...applyUnitIds].sort(),
      skipUnitIds: [...skipUnitIds].sort(),
      actorId,
    };

    return Result.ok({ payload, claimsInput, sourcePlan, applyUnitIds });
  }
}

export class ApplyBulkRatePlanFromTemplateUseCase {
  constructor(
    private readonly propertyRepository: IPropertyRepository,
    private readonly ratePlanRepository: IRatePlanRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly outboxRepository: IOutboxRepository,
    private readonly auditLogRepository: IAuditLogRepository,
    private readonly confirmTokens: IBulkRatePlanConfirmTokenService,
    private readonly previewUseCase: PreviewBulkRatePlanFromTemplateUseCase,
  ) {}

  async execute(
    command: ApplyBulkRatePlanFromTemplateCommand,
    actor: ActorContext,
  ): Promise<Result<ApplyBulkRatePlanFromTemplateResult, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.PRICING_UPDATE_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
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

      const claims = this.confirmTokens.verify(command.confirmationToken);
      if (!claims) {
        return Result.fail(
          new ValidationError("Confirmation token is invalid or expired"),
        );
      }

      if (
        claims.tenantId !== command.tenantId ||
        claims.propertyId !== command.propertyId
      ) {
        return Result.fail(
          new ValidationError("Confirmation token does not match this property"),
        );
      }

      if (claims.actorId !== actor.userId) {
        return Result.fail(
          new ValidationError("Confirmation token was issued for a different operator"),
        );
      }

      if (claims.mode === "overwrite_all" && command.confirmOverwrite !== true) {
        return Result.fail(
          new ValidationError(
            "overwrite_all requires confirmOverwrite: true",
          ),
        );
      }

      const appliedUnitIds: string[] = [];
      const skippedUnitIds: string[] = [];
      let confirmationReference = "";

      await this.propertyRepository.mutateUnderLock(
        command.tenantId,
        command.propertyId,
        () => {
          // Lock only — rate writes run in afterPersist after property row is held.
        },
        async () => {
          const rebuilt = await this.previewUseCase.buildPreview(
            {
              tenantId: command.tenantId,
              propertyId: command.propertyId,
              sourceUnitId: claims.sourceUnitId,
              targetUnitIds: claims.targetUnitIds,
              mode: claims.mode,
            },
            actor.userId,
          );
          if (rebuilt.isFailure) {
            throw rebuilt.getError();
          }

          const { payload, claimsInput, sourcePlan, applyUnitIds } =
            rebuilt.getValue();

          if (!fingerprintsMatch(claims, claimsInput)) {
            throw new ValidationError(
              "Confirmation is stale: source or target pricing changed since preview",
            );
          }

          if (
            !sameIdSet(claims.applyUnitIds, applyUnitIds) ||
            !sameIdSet(claims.skipUnitIds, claimsInput.skipUnitIds) ||
            !sameIdSet(claims.targetUnitIds, claimsInput.targetUnitIds) ||
            claims.mode !== claimsInput.mode ||
            claims.sourceUnitId !== claimsInput.sourceUnitId ||
            claims.roomTypeId !== claimsInput.roomTypeId
          ) {
            throw new ValidationError(
              "Confirmation is stale: target selection or mode no longer matches",
            );
          }

          const syncFrom = new Date().toISOString().slice(0, 10);
          const toDate = new Date();
          toDate.setUTCDate(toDate.getUTCDate() + 365);
          const syncTo = toDate.toISOString().slice(0, 10);
          const revision = Date.now();
          const events: UnitExternalSyncRequiredEvent[] = [];
          const previousSnapshots: Record<string, string> = {
            ...claims.targetFingerprints,
          };
          const newSnapshots: Record<string, string> = {};

          for (const unitId of applyUnitIds) {
            const existing = await this.ratePlanRepository.findByUnitId(
              unitId,
              command.tenantId,
            );
            // Defense: never overwrite when mode says skip and content differs.
            if (
              claims.mode === "skip_customized" &&
              existing &&
              !ratePlansContentEqual(existing, sourcePlan)
            ) {
              throw new ValidationError(
                `Refusing to overwrite protected rate plan for unit ${unitId}`,
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
            newSnapshots[unitId] = ratePlanContentFingerprint(cloned.getValue());
            appliedUnitIds.push(unitId);

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
                sourceEventId: `bulk-rate-apply:${unitId}:${revision}`,
              }),
            );
          }

          skippedUnitIds.push(...claims.skipUnitIds);

          if (events.length > 0) {
            await this.outboxRepository.saveEvents(events);
          }

          confirmationReference = `bulk-rate:${command.propertyId}:${revision}`;

          await this.auditLogRepository.append({
            tenantId: command.tenantId,
            actorId: actor.userId,
            action: "rate_plan.bulk_apply_from_template",
            resourceType: "Property",
            resourceId: command.propertyId,
            metadata: {
              sourceUnitId: claims.sourceUnitId,
              roomTypeId: claims.roomTypeId,
              mode: claims.mode,
              applyUnitIds: [...appliedUnitIds],
              skipUnitIds: [...skippedUnitIds],
              applyCount: appliedUnitIds.length,
              skipCount: skippedUnitIds.length,
              overwriteCount: payload.overwriteCount,
              previousFingerprints: previousSnapshots,
              newFingerprints: newSnapshots,
              sourceFingerprint: claims.sourceFingerprint,
              confirmationReference,
              confirmationExp: claims.exp,
            },
            ipAddress: null,
          });
        },
      );

      return Result.ok({
        appliedUnitIds,
        skippedUnitIds,
        mode: claims.mode,
        sourceUnitId: claims.sourceUnitId,
        confirmationReference,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function resolveTargetIds(
  command: PreviewBulkRatePlanFromTemplateCommand,
  units: Unit[],
  sourceRoomTypeId: string,
): Result<string[], Error> {
  const explicit = command.targetUnitIds
    ? dedupeIds(command.targetUnitIds)
    : null;
  const byRoomType = command.roomTypeId?.trim() || null;

  if (explicit && byRoomType) {
    return Result.fail(
      new ValidationError("Provide targetUnitIds or roomTypeId, not both"),
    );
  }
  if (!explicit && !byRoomType) {
    return Result.fail(
      new ValidationError("targetUnitIds or roomTypeId is required"),
    );
  }

  if (byRoomType) {
    if (byRoomType !== sourceRoomTypeId) {
      return Result.fail(
        new ValidationError("roomTypeId must match the source unit RoomType"),
      );
    }
    // Propagate to active siblings of the same RoomType (exclude source).
    const siblings = units
      .filter(
        (u) =>
          u.deletedAt === null &&
          u.status === "active" &&
          u.roomTypeId === byRoomType &&
          u.id !== command.sourceUnitId,
      )
      .map((u) => u.id)
      .sort();
    if (siblings.length === 0) {
      return Result.fail(
        new ValidationError("No eligible target units found for this RoomType"),
      );
    }
    return Result.ok(siblings);
  }

  const ids = explicit!;
  if (ids.length === 0) {
    return Result.fail(new ValidationError("targetUnitIds must not be empty"));
  }
  if (ids.includes(command.sourceUnitId)) {
    return Result.fail(
      new ValidationError("Source unit cannot be included in targetUnitIds"),
    );
  }
  for (const id of ids) {
    const unit = units.find((u) => u.id === id && u.deletedAt === null);
    if (!unit) {
      return Result.fail(new NotFoundError("Unit", id));
    }
  }
  return Result.ok(ids);
}

function fingerprintsMatch(
  claims: BulkRatePlanConfirmClaims,
  current: Omit<BulkRatePlanConfirmClaims, "typ" | "v" | "iat" | "exp">,
): boolean {
  if (claims.sourceFingerprint !== current.sourceFingerprint) return false;
  if (claims.targetUnitIds.length !== current.targetUnitIds.length) return false;
  for (const id of claims.targetUnitIds) {
    if (claims.targetFingerprints[id] !== current.targetFingerprints[id]) {
      return false;
    }
  }
  return true;
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((id, i) => id === sb[i]);
}
