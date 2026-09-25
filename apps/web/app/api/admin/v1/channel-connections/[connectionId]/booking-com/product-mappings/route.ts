import { NextRequest } from "next/server";
import {
  NotFoundError,
  ValidationError,
  filterMappingsVisibleToActor,
  PermissionChecker,
  assertActorCanAccessChannelProperty,
} from "@hcp/domain";
import {
  getChannelConnectionUseCase,
  upsertChannelProductMappingUseCase,
  listChannelProductMappingsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { serializeProductMapping } from "@/lib/channels/booking-com-operator-view";
import { z } from "zod";

type RouteContext = { params: Promise<{ connectionId: string }> };

const mappingVisibilityChecker = new PermissionChecker();

const upsertSchema = z
  .object({
    mappingId: z.string().trim().min(1).max(255).optional(),
    kind: z.enum(["property_hotel", "unit_room", "rate_plan", "room_rate"]),
    propertyId: z.string().trim().min(1).max(255).nullable().optional(),
    unitId: z.string().trim().min(1).max(255).nullable().optional(),
    ratePlanId: z.string().trim().min(1).max(255).nullable().optional(),
    externalHotelId: z.string().trim().min(1).max(64).nullable().optional(),
    externalRoomTypeId: z.string().trim().min(1).max(64).nullable().optional(),
    externalRatePlanId: z.string().trim().min(1).max(64).nullable().optional(),
    externalRoomRateKey: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .strict();

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

async function assertBookingComConnection(
  tenantId: string,
  connectionId: string,
  actor: ReturnType<typeof toPermissionActor>,
): Promise<void> {
  const result = await getChannelConnectionUseCase.execute(
    { tenantId, connectionId },
    actor,
  );
  if (result.isFailure) throw result.getError();
  if (result.getValue().provider !== "booking_com") {
    throw new ValidationError("Connection is not a Booking.com connection");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();
    const permissionActor = toPermissionActor(actor);
    await assertBookingComConnection(
      actor.tenantId,
      connectionId,
      permissionActor,
    );

    const listed = await listChannelProductMappingsUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
    });
    if (listed.isFailure) return mapResultError(listed.getError());

    const visible = filterMappingsVisibleToActor(
      mappingVisibilityChecker,
      permissionActor,
      actor.tenantId,
      listed.getValue().mappings,
    );

    return apiSuccess({
      mappings: visible.map(serializeProductMapping),
      mappingConfigGeneration: listed.getValue().mappingConfigGeneration,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();
    const permissionActor = toPermissionActor(actor);
    await assertBookingComConnection(
      actor.tenantId,
      connectionId,
      permissionActor,
    );

    const body = upsertSchema.parse(await request.json());
    if (body.propertyId) {
      assertActorCanAccessChannelProperty(
        mappingVisibilityChecker,
        permissionActor,
        actor.tenantId,
        body.propertyId,
      );
    }

    const result = await upsertChannelProductMappingUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
      ...body,
    });
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
