import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type {
  ITenantDashboardOverviewQuery,
  TenantDashboardOverviewReadModel,
} from "../ports/ITenantDashboardOverviewQuery";
import type { ICatalogQueryPort, ITimezoneService } from "../ports/CommercePorts";
import {
  resolveAnalyticsPeriod,
  type AnalyticsPeriodInput,
  type AnalyticsPeriodWindow,
} from "../analytics/AnalyticsPeriod";
import { LocalDate } from "../shared/value-objects/LocalDate";

function addDaysIso(ymd: string, days: number): string {
  return LocalDate.create(ymd).addDays(days).value;
}

export interface GetTenantDashboardOverviewOpts {
  propertyId?: string;
  period?: AnalyticsPeriodInput;
}

/**
 * Single-shot tenant dashboard overview.
 * Permission-gated; uses parallel aggregate queries — never per-booking quote fetches.
 *
 * Optional `propertyId` narrows to one property after ACL check (Active Property Context).
 * Analytics period defaults to Year / property-local current year.
 */
export class GetTenantDashboardOverviewUseCase {
  constructor(
    private readonly overviewQuery: ITenantDashboardOverviewQuery,
    private readonly permissionChecker: PermissionChecker,
    private readonly catalog: ICatalogQueryPort,
    private readonly timezone: ITimezoneService,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    opts?: GetTenantDashboardOverviewOpts,
  ): Promise<Result<TenantDashboardOverviewReadModel, Error>> {
    try {
      const membershipScope = resolveOverviewPropertyScope(
        this.permissionChecker,
        actor,
        tenantId,
      );
      if (membershipScope === undefined) {
        return Result.fail(new ForbiddenError());
      }

      let allowedPropertyIds = membershipScope;
      const propertyId = opts?.propertyId;

      if (propertyId) {
        if (
          !this.permissionChecker.canAccessProperty(
            actor,
            tenantId,
            propertyId,
            "property:read",
          )
        ) {
          return Result.fail(new ForbiddenError("Property access denied"));
        }
        if (
          membershipScope !== null &&
          !membershipScope.includes(propertyId)
        ) {
          return Result.fail(new ForbiddenError("Property access denied"));
        }
        allowedPropertyIds = [propertyId];
      }

      // Prefer Active Property timezone; fall back to first allowed / UTC if tenant-wide.
      const { timezone, localToday } = await this.resolveLocalToday(
        tenantId,
        propertyId,
        allowedPropertyIds,
      );

      const period: AnalyticsPeriodWindow = resolveAnalyticsPeriod(
        opts?.period ?? {},
        localToday,
      );

      const overview = await this.overviewQuery.getOverview({
        tenantId,
        allowedPropertyIds,
        todayIso: localToday,
        arrivalsThroughIso: addDaysIso(localToday, 7),
        period,
        recentLimit: 8,
        propertyTimezone: timezone,
      });

      return Result.ok(overview);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async resolveLocalToday(
    tenantId: string,
    propertyId: string | undefined,
    allowedPropertyIds: string[] | null,
  ): Promise<{ timezone: string; localToday: string }> {
    let timezone = "UTC";

    if (propertyId) {
      const property = await this.catalog.getProperty(propertyId, tenantId);
      if (!property) {
        throw new ValidationError("Property not found");
      }
      timezone = property.timezone || "UTC";
    } else if (allowedPropertyIds !== null && allowedPropertyIds.length === 1) {
      const property = await this.catalog.getProperty(
        allowedPropertyIds[0]!,
        tenantId,
      );
      if (property?.timezone) timezone = property.timezone;
    } else if (allowedPropertyIds === null) {
      const props = await this.catalog.getPropertiesByIds([], tenantId);
      // empty ids → no help; leave UTC. Active Property path always passes propertyId.
      void props;
    }

    const localToday = await this.timezone.propertyLocalToday(timezone);
    return { timezone, localToday };
  }
}

/** null = tenant-wide; string[] = assigned; undefined = forbidden */
function resolveOverviewPropertyScope(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): string[] | null | undefined {
  if (permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_TENANT, tenantId)) {
    return null;
  }
  if (permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_ASSIGNED, tenantId)) {
    return actor.propertyIds ?? [];
  }
  if (permissionChecker.hasPermission(actor, "property:read:tenant", tenantId)) {
    if (actor.role === "manager" && !actor.isSuperAdmin) {
      return actor.propertyIds ?? [];
    }
    return null;
  }
  return undefined;
}
