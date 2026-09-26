import { NextRequest } from "next/server";
import { updateCleaningItemBodySchema } from "@hcp/validators";
import { updateCleaningChecklistItemUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeCleaningItem } from "@/lib/admin/cleaning-serializers";

type RouteContext = {
  params: Promise<{ executionId: string; itemId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { executionId, itemId } = await context.params;
    const body = updateCleaningItemBodySchema.parse(await request.json());

    const result = await updateCleaningChecklistItemUseCase.execute(
      {
        tenantId: actor.tenantId,
        executionId,
        itemId,
        checked: body.checked,
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ data: serializeCleaningItem(result.getValue()) });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
