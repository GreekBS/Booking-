import { NextRequest } from "next/server";
import { cleaningContextQuerySchema } from "@hcp/validators";
import {
  cleaningObjectStorage,
  resolveCleaningContextUseCase,
} from "@/lib/di/container";
import { withCleaningPhotoUrls } from "@hcp/domain";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeCleaningExecution } from "@/lib/admin/cleaning-serializers";

/** Read-only pre-start view for the QR screen. Creates nothing. */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = cleaningContextQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await resolveCleaningContextUseCase.execute(
      {
        tenantId: actor.tenantId,
        locationId: query.locationId,
        unitId: query.unitId,
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());

    const context = result.getValue();
    const activeExecution = context.activeExecution
      ? serializeCleaningExecution(
          context.activeExecution,
          await withCleaningPhotoUrls(
            cleaningObjectStorage,
            context.activeExecution.photos,
          ),
        )
      : null;

    return apiSuccess({
      data: {
        propertyId: context.propertyId,
        propertyName: context.propertyName,
        propertyTimezone: context.propertyTimezone,
        locationId: context.locationId,
        locationName: context.locationName,
        unitId: context.unitId,
        unitName: context.unitName,
        housekeepingStatus: context.housekeepingStatus,
        housekeepingVersion: context.housekeepingVersion,
        selection: context.selection,
        task: context.task
          ? {
              id: context.task.id,
              title: context.task.title,
              status: context.task.status,
              source: context.task.source,
              dueAt: context.task.dueAt?.toISOString() ?? null,
              version: context.task.version,
            }
          : null,
        template: context.template,
        readiness: context.readiness,
        canPerform: context.canPerform,
        activeExecution,
      },
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
