import { NextRequest } from "next/server";
import { z } from "zod";
import {
  enableBookingWhatsAppMessagingUseCase,
  getBookingMessagingProfile,
  listBookingAutomationRuns,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type Ctx = { params: Promise<{ bookingId: string }> };

export async function GET(request: NextRequest, context: Ctx) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const [profile, automations] = await Promise.all([
      getBookingMessagingProfile(actor.tenantId, bookingId),
      listBookingAutomationRuns(actor.tenantId, bookingId),
    ]);
    return apiSuccess({ profile, automations });
  } catch (error) {
    return apiError(error);
  }
}

const bodySchema = z.object({
  whatsappPhone: z.string().min(8).max(32),
  messagingEnabled: z.boolean().optional(),
  alsoUpdateGuestCrm: z.boolean().optional(),
});

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const session = await requireTenantContext(tenantId);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(new Error("Invalid body"));
    }
    const result = await enableBookingWhatsAppMessagingUseCase.execute(
      {
        tenantId: session.tenantId,
        bookingId,
        whatsappPhone: parsed.data.whatsappPhone,
        messagingEnabled: parsed.data.messagingEnabled,
        alsoUpdateGuestCrm: parsed.data.alsoUpdateGuestCrm,
      },
      toPermissionActor(session),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
