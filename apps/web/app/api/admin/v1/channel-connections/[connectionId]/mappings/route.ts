import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import { upsertChannelListingMappingSchema } from "@hcp/validators";
import {
  channelListingMappingRepository,
  getChannelConnectionUseCase,
  upsertChannelListingMappingUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";

type RouteContext = { params: Promise<{ connectionId: string }> };

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

function serializeMapping(mapping: {
  id: string;
  connectionId: string;
  externalListingId: string;
  externalUnitId: string | null;
  propertyId: string;
  unitId: string;
  syncDirection: string;
  status: string;
  mappingVersion: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    mappingId: mapping.id,
    connectionId: mapping.connectionId,
    externalListingId: mapping.externalListingId,
    externalUnitId: mapping.externalUnitId,
    propertyId: mapping.propertyId,
    unitId: mapping.unitId,
    syncDirection: mapping.syncDirection,
    status: mapping.status,
    mappingVersion: mapping.mappingVersion,
    lastError: mapping.lastError,
    createdAt: mapping.createdAt.toISOString(),
    updatedAt: mapping.updatedAt.toISOString(),
  };
}

/**
 * List listing mappings for a connection (operator-safe; no credential material).
 * AuthZ: requireTenantContext + getChannelConnection permission gate.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId: rawId } = await context.params;
    const connectionId = rawId?.trim() ?? "";
    if (!connectionId) {
      throw new ValidationError("connectionId is required");
    }

    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const connectionResult = await getChannelConnectionUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
      },
      toPermissionActor(actor),
    );
    if (connectionResult.isFailure) {
      return mapResultError(connectionResult.getError());
    }

    const mappings = await channelListingMappingRepository.listByConnection(
      actor.tenantId,
      connectionId,
    );

    return apiSuccess({
      mappings: mappings.map(serializeMapping),
    });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * P1-S6c — create or update the iCal listing mapping for a connection.
 *
 * Unit reassignment and replacement require a paused connection and bump the
 * semantic epoch; property/external-identity edits do not. Every successful
 * mutation reports `requiresPollRematerialization`.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const body = upsertChannelListingMappingSchema.parse(await request.json());

    const result = await upsertChannelListingMappingUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        mappingId: body.mappingId,
        replaceMappingId: body.replaceMappingId,
        externalListingId: body.externalListingId,
        externalUnitId: body.externalUnitId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        syncDirection: body.syncDirection,
        expectedSemanticConfigVersion: body.expectedSemanticConfigVersion,
        reason: body.reason,
      },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
