import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-error-handler";
import { requireTenantContext } from "@/lib/tenant-context";
import { getBookingComPartnerAccessStatus } from "@/lib/channels/booking-com-operator-access";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { NotFoundError } from "@hcp/domain";

/** Tenant-scoped Booking.com capability probe (no secrets). */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    await requireTenantContext(tenantId);
    if (!isChannelOperatorApiEnabled()) {
      throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
    }
    return apiSuccess({
      provider: "booking_com",
      ...getBookingComPartnerAccessStatus(),
    });
  } catch (error) {
    return apiError(error);
  }
}
