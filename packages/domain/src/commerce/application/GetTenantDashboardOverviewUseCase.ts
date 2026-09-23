import { Result } from "../../shared/kernel/Result";
import { ForbiddenError } from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type {
  ITenantDashboardOverviewQuery,
  TenantDashboardOverviewReadModel,
} from "../ports/ITenantDashboardOverviewQuery";

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Single-shot tenant dashboard overview.
 * Permission-gated; uses parallel aggregate queries — never per-booking quote fetches.
 */
export class GetTenantDashboardOverviewUseCase {
  constructor(
    private readonly overviewQuery: ITenantDashboardOverviewQuery,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<TenantDashboardOverviewReadModel, Error>> {
    try {
      const allowedPropertyIds = resolveOverviewPropertyScope(
        this.permissionChecker,
        actor,
        tenantId,
      );
      if (allowedPropertyIds === undefined) {
        return Result.fail(new ForbiddenError());
      }

      const today = todayUtcIso();
      const overview = await this.overviewQuery.getOverview({
        tenantId,
        allowedPropertyIds,
        todayIso: today,
        arrivalsThroughIso: addDaysIso(today, 7),
        occupancyThroughIso: addDaysIso(today, 30),
        recentLimit: 8,
      });

      return Result.ok(overview);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
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
  // Fall back to property:read:tenant for catalog-only operators who can see the shell
  if (permissionChecker.hasPermission(actor, "property:read:tenant", tenantId)) {
    if (actor.role === "manager" && !actor.isSuperAdmin) {
      return actor.propertyIds ?? [];
    }
    return null;
  }
  return undefined;
}
