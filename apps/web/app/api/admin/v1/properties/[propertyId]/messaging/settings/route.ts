import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getPropertyMessagingSettings,
  upsertPropertyMessagingSettingsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type Ctx = { params: Promise<{ propertyId: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  try {
    const { propertyId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const settings = await getPropertyMessagingSettings(
      actor.tenantId,
      propertyId,
    );
    return apiSuccess(settings);
  } catch (error) {
    return apiError(error);
  }
}

const bodySchema = z.object({
  whatsappEnabled: z.boolean(),
  welcomeEnabled: z.boolean(),
  welcomeTemplateName: z.string().max(128).nullable(),
  welcomeTemplateLanguage: z.string().max(16).optional(),
  arrivalEnabled: z.boolean(),
  arrivalTemplateName: z.string().max(128).nullable(),
  arrivalTemplateLanguage: z.string().max(16).optional(),
  arrivalTimingMode: z.enum([
    "check_in_local_time",
    "days_before_check_in",
    "hours_before_check_in",
  ]),
  arrivalLocalTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  arrivalOffsetDays: z.number().int().min(0).max(30).optional(),
  arrivalOffsetHours: z.number().int().min(0).max(168).optional(),
});

export async function PUT(request: NextRequest, context: Ctx) {
  try {
    const { propertyId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const session = await requireTenantContext(tenantId);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(new Error("Invalid body"));
    }
    const result = await upsertPropertyMessagingSettingsUseCase.execute(
      {
        tenantId: session.tenantId,
        propertyId,
        ...parsed.data,
        welcomeTemplateLanguage: parsed.data.welcomeTemplateLanguage ?? "en",
        arrivalTemplateLanguage: parsed.data.arrivalTemplateLanguage ?? "en",
        arrivalLocalTime: parsed.data.arrivalLocalTime ?? "09:00",
        arrivalOffsetDays: parsed.data.arrivalOffsetDays ?? 0,
        arrivalOffsetHours: parsed.data.arrivalOffsetHours ?? 0,
      },
      toPermissionActor(session),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
