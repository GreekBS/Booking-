import { NextRequest } from "next/server";
import { CLEANING_PHOTO_MAX_BYTES, ValidationError } from "@hcp/domain";
import { registerCleaningPhotoUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeCleaningPhoto } from "@/lib/admin/cleaning-serializers";

type RouteContext = { params: Promise<{ executionId: string }> };

/** Multipart upload: `file` plus optional `executionItemId`. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { executionId } = await context.params;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("A photo file is required");
    }
    if (file.size > CLEANING_PHOTO_MAX_BYTES) {
      throw new ValidationError(
        `Photo exceeds the ${Math.round(CLEANING_PHOTO_MAX_BYTES / (1024 * 1024))}MB limit`,
      );
    }
    const rawItemId = form.get("executionItemId");
    const executionItemId =
      typeof rawItemId === "string" && rawItemId.trim() ? rawItemId.trim() : null;

    const result = await registerCleaningPhotoUseCase.execute(
      {
        tenantId: actor.tenantId,
        executionId,
        executionItemId,
        contentType: file.type,
        body: new Uint8Array(await file.arrayBuffer()),
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    return apiSuccess({ data: serializeCleaningPhoto(result.getValue()) }, 201);
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
