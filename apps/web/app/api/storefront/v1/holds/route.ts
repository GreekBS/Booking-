import { NextRequest } from "next/server";
import { storefrontCreateHoldSchema } from "@hcp/validators";
import { createStorefrontActor } from "@hcp/domain";
import {
  createHoldUseCase,
  holdRepository,
  storefrontCatalogAdapter,
  storefrontIdempotencyRepository,
} from "@/lib/di/container";
import {
  requireIdempotencyKey,
  requireStorefrontContext,
} from "@/lib/storefront/storefront-context";
import { checkStorefrontRateLimit } from "@/lib/storefront/storefront-rate-limit";
import {
  mapStorefrontResultError,
  storefrontError,
  storefrontSuccess,
} from "@/lib/storefront/storefront-response";
import { mapPublicHold } from "@/lib/storefront/storefront-mappers";
import { NotFoundError } from "@hcp/domain";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStorefrontContext(request);
    checkStorefrontRateLimit(request, ctx.publishableKeyId);
    const idempotencyKey = requireIdempotencyKey(request);

    const body = storefrontCreateHoldSchema.parse(await request.json());
    const actor = createStorefrontActor(ctx.tenantId);

    const existingResourceId = await storefrontIdempotencyRepository.findResourceId(
      ctx.tenantId,
      "hold",
      idempotencyKey,
    );
    if (existingResourceId) {
      const existingHold = await holdRepository.findById(existingResourceId, ctx.tenantId);
      if (existingHold) {
        return storefrontSuccess(ctx, mapPublicHold(existingHold));
      }
    }

    const existingByKey = await holdRepository.findByIdempotencyKey(
      ctx.tenantId,
      idempotencyKey,
    );
    if (existingByKey) {
      return storefrontSuccess(ctx, mapPublicHold(existingByKey));
    }

    const unitPublished = await storefrontCatalogAdapter.isPublishedUnit(
      ctx.tenantId,
      body.unitId,
    );
    if (!unitPublished) {
      throw new NotFoundError("Unit", body.unitId);
    }

    const result = await createHoldUseCase.execute(
      {
        tenantId: ctx.tenantId,
        unitId: body.unitId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guestCount: body.guestCount,
        sessionRef: idempotencyKey,
      },
      actor,
    );

    if (result.isFailure) {
      return mapStorefrontResultError(result.getError());
    }

    const hold = result.getValue();
    await storefrontIdempotencyRepository.save(
      ctx.tenantId,
      "hold",
      idempotencyKey,
      hold.id,
      new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    );

    return storefrontSuccess(ctx, mapPublicHold(hold), 201);
  } catch (error) {
    return storefrontError(error);
  }
}
