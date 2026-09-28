import { NextRequest } from "next/server";
import { z } from "zod";
import {
  enableBookingWhatsAppMessagingUseCase,
  getBookingMessagingProfile,
  listBookingAutomationRuns,
  sendBookingWelcomeEmailUseCase,
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
    return apiSuccess({
      profile,
      automations,
      welcomeEmail: profile
        ? {
            status: profile.welcomeEmailStatus,
            to: profile.welcomeEmailTo,
            sentAt: profile.welcomeEmailSentAt,
            lastError: profile.welcomeEmailLastError,
          }
        : null,
      whatsappConnected:
        Boolean(profile?.messagingEnabled) &&
        profile?.identityStatus === "bound" &&
        Boolean(profile?.guestChannelIdentity),
    });
  } catch (error) {
    return apiError(error);
  }
}

const enableSchema = z.object({
  action: z.literal("enable_whatsapp").optional(),
  whatsappPhone: z.string().min(8).max(32),
  messagingEnabled: z.boolean().optional(),
  alsoUpdateGuestCrm: z.boolean().optional(),
});

const welcomeSchema = z.object({
  action: z.literal("send_welcome_email"),
  manualResend: z.boolean().optional(),
});

export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const session = await requireTenantContext(tenantId);
    const raw = (await request.json()) as Record<string, unknown>;

    if (raw?.action === "send_welcome_email") {
      const parsed = welcomeSchema.safeParse(raw);
      if (!parsed.success) return apiError(new Error("Invalid body"));
      const result = await sendBookingWelcomeEmailUseCase.execute(
        {
          tenantId: session.tenantId,
          bookingId,
          manualResend: parsed.data.manualResend === true,
        },
        toPermissionActor(session),
      );
      if (result.isFailure) return mapResultError(result.getError());
      return apiSuccess(result.getValue());
    }

    const parsed = enableSchema.safeParse(raw);
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
