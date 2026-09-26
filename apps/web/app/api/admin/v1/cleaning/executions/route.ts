import { NextRequest } from "next/server";
import { startCleaningBodySchema } from "@hcp/validators";
import { withCleaningPhotoUrls } from "@hcp/domain";
import {
  cleaningObjectStorage,
  startOrResumeCleaningUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeCleaningExecution } from "@/lib/admin/cleaning-serializers";

/** Start a cleaning, or resume the one already in progress for the unit. */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = startCleaningBodySchema.parse(await request.json());

    const result = await startOrResumeCleaningUseCase.execute(
      { tenantId: actor.tenantId, unitId: body.unitId },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    const value = result.getValue();
    const photos = await withCleaningPhotoUrls(
      cleaningObjectStorage,
      value.execution.photos,
    );

    return apiSuccess(
      {
        data: {
          execution: serializeCleaningExecution(value.execution, photos),
          created: value.created,
          taskCreated: value.taskCreated,
          taskId: value.taskId,
        },
      },
      value.created ? 201 : 200,
    );
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
