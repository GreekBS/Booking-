import type { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import type { GetTenantDashboardOverviewUseCase } from "../../commerce/application/GetTenantDashboardOverviewUseCase";
import type { GetBookingUseCase, CheckAvailabilityUseCase } from "../../commerce/application/CommerceUseCases";
import type { SearchBookingsUseCase } from "../../commerce/application/BookingQueryUseCases";
import type { GetUnitsCalendarBatchUseCase } from "../../commerce/application/BatchCalendarReadUseCases";
import type { GetHousekeepingTodayUseCase } from "../../operations/application/GetHousekeepingTodayUseCase";
import type { ListTasksUseCase } from "../../operations/application/TaskUseCases";
import type { ListPropertyUnitCatalogUseCase } from "../../catalog/application/PropertyQueryUseCases";
import type {
  GetConversationThreadUseCase,
  ListOpenEscalationsUseCase,
} from "../../messaging/application/MessagingUseCases";
import type { PropertyUnitCatalogResult } from "../../catalog/types/PropertyUnitCatalog";
import {
  MAX_BOOKING_SEARCH,
  MAX_CALENDAR_DAYS,
  type CopilotOperatorContext,
} from "../domain/OperatorCopilotTypes";
import type { OperatorCopilotToolDeclaration } from "../ports/IOperatorCopilotProvider";
import {
  getOperatorCopilotToolDeclarations,
  isOperatorCopilotToolName,
  type OperatorCopilotToolName,
} from "./OperatorCopilotToolDefs";
import {
  minimizeAvailability,
  minimizeBookingSummary,
  minimizeCalendar,
  minimizeCatalog,
  minimizeConversationSummary,
  minimizeEscalations,
  minimizeHousekeeping,
  minimizeSearchBookings,
  minimizeTasks,
  minimizeTodayOverview,
} from "./tools/minimizeDtos";

/**
 * Existing read use cases injected into the registry.
 * Typed as `Pick<..., "execute">` so tests can supply light fakes.
 */
export interface OperatorCopilotToolDeps {
  getTenantDashboardOverviewUseCase: Pick<GetTenantDashboardOverviewUseCase, "execute">;
  getHousekeepingTodayUseCase: Pick<GetHousekeepingTodayUseCase, "execute">;
  getBookingUseCase: Pick<GetBookingUseCase, "execute">;
  searchBookingsUseCase: Pick<SearchBookingsUseCase, "execute">;
  getUnitsCalendarBatchUseCase: Pick<GetUnitsCalendarBatchUseCase, "execute">;
  checkAvailabilityUseCase: Pick<CheckAvailabilityUseCase, "execute">;
  getConversationThreadUseCase: Pick<GetConversationThreadUseCase, "execute">;
  listOpenEscalationsUseCase: Pick<ListOpenEscalationsUseCase, "execute">;
  listTasksUseCase: Pick<ListTasksUseCase, "execute">;
  listPropertyUnitCatalogUseCase: Pick<ListPropertyUnitCatalogUseCase, "execute">;
  permissionChecker: PermissionChecker;
}

/** Registry execute() outcome (not the provider round-trip toolResults entry). */
export interface OperatorCopilotToolExecutionResult {
  ok: boolean;
  data?: unknown;
  errorCode?: string;
}

/** Machine-readable error codes returned to the model (never raw exception text). */
export const COPILOT_TOOL_ERROR = {
  UNKNOWN_TOOL: "unknown_tool",
  INVALID_ARGUMENTS: "invalid_arguments",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  PROPERTY_REQUIRED: "property_required",
  VALIDATION: "validation_error",
  TOOL_FAILED: "tool_error",
} as const;

const MAX_CALENDAR_UNITS = 20;
const DEFAULT_TASK_LIMIT = 10;
const MAX_TASK_LIMIT = 20;
const MAX_AVAILABILITY_NIGHTS = 90;
const MAX_GUEST_SEARCH_CHARS = 80;
const BOOKING_STATUSES = [
  "pending",
  "payment_pending",
  "confirmed",
  "cancelled",
  "completed",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ToolArgError extends Error {}
class ToolFailure extends Error {
  constructor(readonly errorCode: string) {
    super(errorCode);
  }
}

type Args = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Args {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assertKnownKeys(args: Args, allowed: readonly string[]): void {
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new ToolArgError(`unknown argument: ${key}`);
    }
  }
}

function optUuid(args: Args, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !UUID_RE.test(v)) {
    throw new ToolArgError(`${key} must be a UUID`);
  }
  return v.toLowerCase();
}

function reqUuid(args: Args, key: string): string {
  const v = optUuid(args, key);
  if (!v) throw new ToolArgError(`${key} is required`);
  return v;
}

function parseIsoDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  const dt = new Date(ms);
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return ms;
}

function optDate(args: Args, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || parseIsoDate(v) === null) {
    throw new ToolArgError(`${key} must be an ISO date (YYYY-MM-DD)`);
  }
  return v;
}

function reqDate(args: Args, key: string): string {
  const v = optDate(args, key);
  if (!v) throw new ToolArgError(`${key} is required`);
  return v;
}

function optInt(
  args: Args,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new ToolArgError(`${key} must be an integer between ${min} and ${max}`);
  }
  return v;
}

function optString(args: Args, key: string, maxChars: number): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new ToolArgError(`${key} must be a string`);
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxChars) {
    throw new ToolArgError(`${key} is too long`);
  }
  return trimmed;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIsoDate(toIso)! - parseIsoDate(fromIso)!) / 86_400_000);
}

function mapError(error: unknown): string {
  if (error instanceof ToolFailure) return error.errorCode;
  if (error instanceof ToolArgError) return COPILOT_TOOL_ERROR.INVALID_ARGUMENTS;
  if (error instanceof ForbiddenError) return COPILOT_TOOL_ERROR.FORBIDDEN;
  if (error instanceof NotFoundError) return COPILOT_TOOL_ERROR.NOT_FOUND;
  if (error instanceof ValidationError) {
    return /not found/i.test(error.message)
      ? COPILOT_TOOL_ERROR.NOT_FOUND
      : COPILOT_TOOL_ERROR.VALIDATION;
  }
  return COPILOT_TOOL_ERROR.TOOL_FAILED;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export class OperatorCopilotToolRegistry {
  constructor(private readonly deps: OperatorCopilotToolDeps) {}

  listDeclarations(): OperatorCopilotToolDeclaration[] {
    return getOperatorCopilotToolDeclarations();
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ): Promise<OperatorCopilotToolExecutionResult> {
    if (!isOperatorCopilotToolName(toolName)) {
      return { ok: false, errorCode: COPILOT_TOOL_ERROR.UNKNOWN_TOOL };
    }

    try {
      // Context and actor must describe the same authenticated operator.
      if (actor.userId !== ctx.userId) {
        return { ok: false, errorCode: COPILOT_TOOL_ERROR.FORBIDDEN };
      }
      if (!isPlainObject(args)) {
        throw new ToolArgError("arguments must be an object");
      }
      const data = await this.dispatch(toolName, args, ctx, actor);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, errorCode: mapError(error) };
    }
  }

  // -------------------------------------------------------------------------

  private dispatch(
    tool: OperatorCopilotToolName,
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ): Promise<unknown> {
    switch (tool) {
      case "get_today_overview":
        return this.getTodayOverview(args, ctx, actor);
      case "get_housekeeping_today":
        return this.getHousekeepingToday(args, ctx, actor);
      case "get_booking_summary":
        return this.getBookingSummary(args, ctx, actor);
      case "search_bookings":
        return this.searchBookings(args, ctx, actor);
      case "get_calendar_snapshot":
        return this.getCalendarSnapshot(args, ctx, actor);
      case "check_unit_availability":
        return this.checkUnitAvailability(args, ctx, actor);
      case "get_conversation_summary":
        return this.getConversationSummary(args, ctx, actor);
      case "list_open_escalations":
        return this.listOpenEscalations(args, ctx, actor);
      case "list_tasks_attention":
        return this.listTasksAttention(args, ctx, actor);
      case "get_property_catalog":
        return this.getPropertyCatalog(args, ctx, actor);
    }
  }

  // ----- ACL helpers -------------------------------------------------------

  /** Fail-closed property check: actor ACL AND (non-super-admin) context scope. */
  private isPropertyAuthorized(
    propertyId: string,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ): boolean {
    const superAdmin = actor.isSuperAdmin === true || actor.role === "super_admin";
    if (
      !this.deps.permissionChecker.canAccessProperty(
        actor,
        ctx.tenantId,
        propertyId,
        "property:read",
      )
    ) {
      return false;
    }
    if (!superAdmin && ctx.propertyIds !== null && !ctx.propertyIds.includes(propertyId)) {
      return false;
    }
    return true;
  }

  /**
   * Resolve the property for a tool: explicit model-supplied id (re-authorized)
   * or the trusted Active Property. Never trusts a model-supplied id without ACL.
   */
  private resolveProperty(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
    opts: { required: boolean },
  ): { propertyId: string | undefined; explicit: boolean } {
    const explicitId = optUuid(args, "propertyId");
    const propertyId = explicitId ?? ctx.activePropertyId ?? undefined;
    if (!propertyId) {
      if (opts.required) throw new ToolFailure(COPILOT_TOOL_ERROR.PROPERTY_REQUIRED);
      return { propertyId: undefined, explicit: false };
    }
    if (!this.isPropertyAuthorized(propertyId, ctx, actor)) {
      throw new ToolFailure(COPILOT_TOOL_ERROR.FORBIDDEN);
    }
    return { propertyId, explicit: explicitId !== undefined };
  }

  private unwrap<T>(result: Result<T, Error>): T {
    if (result.isFailure) throw result.getError();
    return result.getValue();
  }

  private async loadCatalog(
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ): Promise<PropertyUnitCatalogResult> {
    const catalog = this.unwrap(
      await this.deps.listPropertyUnitCatalogUseCase.execute(ctx.tenantId, actor),
    );
    // Intersect with the context's property scope (fail closed).
    const superAdmin = actor.isSuperAdmin === true || actor.role === "super_admin";
    if (superAdmin || ctx.propertyIds === null) return catalog;
    const allowed = new Set(ctx.propertyIds);
    return { properties: catalog.properties.filter((p) => allowed.has(p.id)) };
  }

  // ----- Tools -------------------------------------------------------------

  private async getTodayOverview(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, ["propertyId"]);
    const { propertyId } = this.resolveProperty(args, ctx, actor, { required: false });
    const overview = this.unwrap(
      await this.deps.getTenantDashboardOverviewUseCase.execute(
        ctx.tenantId,
        actor,
        propertyId ? { propertyId } : undefined,
      ),
    );
    return minimizeTodayOverview(overview);
  }

  private async getHousekeepingToday(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, ["propertyId"]);
    const { propertyId } = this.resolveProperty(args, ctx, actor, { required: true });
    const board = this.unwrap(
      await this.deps.getHousekeepingTodayUseCase.execute(
        { tenantId: ctx.tenantId, propertyId: propertyId! },
        actor,
      ),
    );
    return minimizeHousekeeping(board);
  }

  private async getBookingSummary(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, ["bookingId"]);
    const bookingId = reqUuid(args, "bookingId");
    const booking = this.unwrap(
      await this.deps.getBookingUseCase.execute(ctx.tenantId, bookingId, actor),
    );
    if (!this.isPropertyAuthorized(booking.propertyId, ctx, actor)) {
      throw new ToolFailure(COPILOT_TOOL_ERROR.FORBIDDEN);
    }
    return minimizeBookingSummary(booking);
  }

  private async searchBookings(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, [
      "propertyId",
      "unitId",
      "status",
      "guestSearch",
      "checkInFrom",
      "checkInTo",
      "checkOutFrom",
      "checkOutTo",
      "limit",
    ]);
    const { propertyId } = this.resolveProperty(args, ctx, actor, { required: false });
    const unitId = optUuid(args, "unitId");

    const status = optString(args, "status", 32);
    if (status && !(BOOKING_STATUSES as readonly string[]).includes(status)) {
      throw new ToolArgError("status is not a valid booking status");
    }
    const guestSearch = optString(args, "guestSearch", MAX_GUEST_SEARCH_CHARS);
    const checkInFrom = optDate(args, "checkInFrom");
    const checkInTo = optDate(args, "checkInTo");
    const checkOutFrom = optDate(args, "checkOutFrom");
    const checkOutTo = optDate(args, "checkOutTo");
    if (checkInFrom && checkInTo && checkInFrom > checkInTo) {
      throw new ToolArgError("checkInFrom must not be after checkInTo");
    }
    if (checkOutFrom && checkOutTo && checkOutFrom > checkOutTo) {
      throw new ToolArgError("checkOutFrom must not be after checkOutTo");
    }
    const limit = Math.min(
      optInt(args, "limit", 1, MAX_BOOKING_SEARCH) ?? MAX_BOOKING_SEARCH,
      MAX_BOOKING_SEARCH,
    );
    const hasDateFilter = Boolean(checkInFrom || checkInTo || checkOutFrom || checkOutTo);

    const page = this.unwrap(
      await this.deps.searchBookingsUseCase.execute(
        {
          tenantId: ctx.tenantId,
          ...(propertyId ? { propertyId } : {}),
          ...(unitId ? { unitId } : {}),
          ...(status ? { status } : {}),
          ...(guestSearch ? { guestSearch } : {}),
          ...(checkInFrom ? { checkInFrom } : {}),
          ...(checkInTo ? { checkInTo } : {}),
          ...(checkOutFrom ? { checkOutFrom } : {}),
          ...(checkOutTo ? { checkOutTo } : {}),
          page: 1,
          limit,
          sortBy: "checkIn",
          sortDir: hasDateFilter ? "asc" : "desc",
        },
        actor,
      ),
    );

    // Defense in depth: drop any row outside the context's property scope.
    const rows = page.data
      .filter((b) => this.isPropertyAuthorized(b.propertyId, ctx, actor))
      .slice(0, limit);
    return minimizeSearchBookings({ ...page, data: rows });
  }

  private async getCalendarSnapshot(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, ["propertyId", "unitIds", "from", "to"]);
    const from = reqDate(args, "from");
    const to = reqDate(args, "to");
    const days = daysBetween(from, to);
    if (days < 1) throw new ToolArgError("to must be after from");
    if (days > MAX_CALENDAR_DAYS) {
      throw new ToolArgError(`range must not exceed ${MAX_CALENDAR_DAYS} days`);
    }

    let requestedUnitIds: string[] | undefined;
    const rawUnitIds = args.unitIds;
    if (rawUnitIds !== undefined && rawUnitIds !== null) {
      if (!Array.isArray(rawUnitIds)) throw new ToolArgError("unitIds must be an array");
      if (rawUnitIds.length === 0) throw new ToolArgError("unitIds must not be empty");
      if (rawUnitIds.length > MAX_CALENDAR_UNITS) {
        throw new ToolArgError(`unitIds must not exceed ${MAX_CALENDAR_UNITS}`);
      }
      requestedUnitIds = [
        ...new Set(
          rawUnitIds.map((id) => {
            if (typeof id !== "string" || !UUID_RE.test(id)) {
              throw new ToolArgError("unitIds must contain UUIDs");
            }
            return id.toLowerCase();
          }),
        ),
      ];
    }

    const { propertyId, explicit } = this.resolveProperty(args, ctx, actor, {
      required: requestedUnitIds === undefined,
    });

    // Catalog is ACL-scoped: it both resolves units and bounds model-supplied ids.
    const catalog = await this.loadCatalog(ctx, actor);
    const unitIndex = new Map<string, { name: string; propertyId: string }>();
    for (const p of catalog.properties) {
      for (const u of p.units) unitIndex.set(u.id, { name: u.name, propertyId: p.id });
    }

    let unitIds: string[];
    let unitsTruncated = false;
    if (requestedUnitIds) {
      for (const id of requestedUnitIds) {
        const entry = unitIndex.get(id);
        if (!entry) throw new ToolFailure(COPILOT_TOOL_ERROR.NOT_FOUND);
        if (explicit && propertyId && entry.propertyId !== propertyId) {
          throw new ToolFailure(COPILOT_TOOL_ERROR.INVALID_ARGUMENTS);
        }
      }
      unitIds = requestedUnitIds;
    } else {
      const property = catalog.properties.find((p) => p.id === propertyId);
      if (!property) throw new ToolFailure(COPILOT_TOOL_ERROR.NOT_FOUND);
      const units = property.units.filter((u) => u.status !== "archived");
      unitsTruncated = units.length > MAX_CALENDAR_UNITS;
      unitIds = units.slice(0, MAX_CALENDAR_UNITS).map((u) => u.id);
      if (unitIds.length === 0) throw new ToolFailure(COPILOT_TOOL_ERROR.NOT_FOUND);
    }

    const snapshot = this.unwrap(
      await this.deps.getUnitsCalendarBatchUseCase.execute(
        { tenantId: ctx.tenantId, unitIds, from, to },
        actor,
      ),
    );
    const names: Record<string, string> = {};
    for (const id of unitIds) {
      const entry = unitIndex.get(id);
      if (entry) names[id] = entry.name;
    }
    return {
      range: { from, to, days },
      unitsTruncated,
      ...minimizeCalendar(snapshot, names),
    };
  }

  private async checkUnitAvailability(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, ["unitId", "checkIn", "checkOut", "guestCount"]);
    const unitId = reqUuid(args, "unitId");
    const checkIn = reqDate(args, "checkIn");
    const checkOut = reqDate(args, "checkOut");
    const nights = daysBetween(checkIn, checkOut);
    if (nights < 1) throw new ToolArgError("checkOut must be after checkIn");
    if (nights > MAX_AVAILABILITY_NIGHTS) {
      throw new ToolArgError(`stay must not exceed ${MAX_AVAILABILITY_NIGHTS} nights`);
    }
    const guestCount = optInt(args, "guestCount", 1, 50) ?? 1;

    // Bound the unit to the operator's authorized catalog before evaluating.
    const catalog = await this.loadCatalog(ctx, actor);
    const known = catalog.properties.some((p) => p.units.some((u) => u.id === unitId));
    if (!known) throw new ToolFailure(COPILOT_TOOL_ERROR.NOT_FOUND);

    const result = this.unwrap(
      await this.deps.checkAvailabilityUseCase.execute(
        { tenantId: ctx.tenantId, unitId, checkIn, checkOut, guestCount },
        actor,
      ),
    );
    return minimizeAvailability(result);
  }

  private async getConversationSummary(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, ["conversationId"]);
    const conversationId = reqUuid(args, "conversationId");
    const thread = this.unwrap(
      await this.deps.getConversationThreadUseCase.execute(
        { tenantId: ctx.tenantId, conversationId },
        actor,
      ),
    );
    if (!this.isPropertyAuthorized(thread.conversation.propertyId, ctx, actor)) {
      throw new ToolFailure(COPILOT_TOOL_ERROR.FORBIDDEN);
    }
    return minimizeConversationSummary(
      { conversation: thread.conversation, messages: thread.messages },
      { wrapUntrusted: true },
    );
  }

  private async listOpenEscalations(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, ["propertyId"]);
    const { propertyId } = this.resolveProperty(args, ctx, actor, { required: true });
    const escalations = this.unwrap(
      await this.deps.listOpenEscalationsUseCase.execute(
        { tenantId: ctx.tenantId, propertyId, entireTenant: false },
        actor,
      ),
    );
    return minimizeEscalations(
      escalations.filter((e) => this.isPropertyAuthorized(e.propertyId, ctx, actor)),
    );
  }

  private async listTasksAttention(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, ["propertyId", "limit"]);
    const { propertyId } = this.resolveProperty(args, ctx, actor, { required: true });
    const limit = Math.min(
      optInt(args, "limit", 1, MAX_TASK_LIMIT) ?? DEFAULT_TASK_LIMIT,
      MAX_TASK_LIMIT,
    );
    const page = this.unwrap(
      await this.deps.listTasksUseCase.execute(
        {
          tenantId: ctx.tenantId,
          propertyId,
          entireTenant: false,
          status: ["OPEN", "IN_PROGRESS"],
          page: 1,
          limit,
        },
        actor,
      ),
    );
    return minimizeTasks({
      total: page.total,
      data: page.data
        .filter((t) => this.isPropertyAuthorized(t.propertyId, ctx, actor))
        .slice(0, limit),
    });
  }

  private async getPropertyCatalog(
    args: Args,
    ctx: CopilotOperatorContext,
    actor: ActorContext,
  ) {
    assertKnownKeys(args, []);
    return minimizeCatalog(await this.loadCatalog(ctx, actor));
  }
}