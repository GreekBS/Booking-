import { NextRequest } from "next/server";
import { storefrontAvailabilityCheckSchema } from "@hcp/validators";
import { createStorefrontActor } from "@hcp/domain";
import {
  checkAvailabilityUseCase,
  getAvailabilityRulesUseCase,
  storefrontCatalogAdapter,
} from "@/lib/di/container";
import {
  requireStorefrontContext,
} from "@/lib/storefront/storefront-context";
import { checkStorefrontRateLimit } from "@/lib/storefront/storefront-rate-limit";
import {
  mapStorefrontResultError,
  storefrontError,
  storefrontSuccess,
} from "@/lib/storefront/storefront-response";
import { mapAvailabilityResult } from "@/lib/storefront/storefront-mappers";
import { NotFoundError } from "@hcp/domain";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStorefrontContext(request);
    checkStorefrontRateLimit(request, ctx.publishableKeyId);

    const body = storefrontAvailabilityCheckSchema.parse(await request.json());
    const actor = createStorefrontActor(ctx.tenantId);

    const unitPublished = await storefrontCatalogAdapter.isPublishedUnit(
      ctx.tenantId,
      body.unitId,
    );
    if (!unitPublished) {
      throw new NotFoundError("Unit", body.unitId);
    }

    const availabilityResult = await checkAvailabilityUseCase.execute(
      {
        tenantId: ctx.tenantId,
        unitId: body.unitId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guestCount: body.guestCount,
      },
      actor,
    );

    if (availabilityResult.isFailure) {
      return mapStorefrontResultError(availabilityResult.getError());
    }

    const rulesResult = await getAvailabilityRulesUseCase.execute(
      ctx.tenantId,
      body.unitId,
      actor,
    );

    if (rulesResult.isFailure) {
      return mapStorefrontResultError(rulesResult.getError());
    }

    return storefrontSuccess(
      ctx,
      mapAvailabilityResult(availabilityResult.getValue(), rulesResult.getValue()),
    );
  } catch (error) {
    return storefrontError(error);
  }
}
