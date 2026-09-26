import { NextRequest } from "next/server";
import { completeCleaningBodySchema } from "@hcp/validators";
import { withCleaningPhotoUrls } from "@hcp/domain";
import {
  cleaningObjectStorage,
  completeCleaningUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeCleaningExecution } from "@/lib/admin/cleaning-serializers";

type RouteContext = { params: Promise<{ executionId: string }> };

/**
 * Completes the cleaning and, in the same transaction, the housekeeping task —
 * so the unit flips to CLEAN or nothing changes at all.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { executionId } = await context.params;
    const body = completeCleaningBodySchema.parse(await request.json());

    const result = await completeCleaningUseCase.execute(
      {
        tenantId: actor.tenantId,
        executionId,
        expectedVersion: body.expectedVersion,
        completionNote: body.completionNote,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    const value = result.getValue();
    const photos = await withCleaningPhotoUrls(
      cleaningObjectStorage,
      value.execution.photos,
    );

    return apiSuccess({
      data: {
        execution: serializeCleaningExecution(value.execution, photos),
        task: {
          id: value.task.id,
          status: value.task.status,
          version: value.task.version,
          completedAt: value.task.completedAt?.toISOString() ?? null,
        },
        housekeeping: value.housekeeping
          ? {
              unitId: value.housekeeping.unitId,
              status: value.housekeeping.status,
              source: value.housekeeping.source,
              version: value.housekeeping.version,
              updatedAt: value.housekeeping.updatedAt.toISOString(),
            }
          : null,
      },
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
