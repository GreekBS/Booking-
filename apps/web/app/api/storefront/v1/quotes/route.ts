import { NextRequest } from "next/server";
import { storefrontCreateQuoteSchema } from "@hcp/validators";
import { createStorefrontActor } from "@hcp/domain";
import { createQuoteUseCase } from "@/lib/di/container";
import { requireStorefrontContext } from "@/lib/storefront/storefront-context";
import { checkStorefrontRateLimit } from "@/lib/storefront/storefront-rate-limit";
import {
  mapStorefrontResultError,
  storefrontError,
  storefrontSuccess,
} from "@/lib/storefront/storefront-response";
import { mapPublicQuote } from "@/lib/storefront/storefront-mappers";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStorefrontContext(request);
    checkStorefrontRateLimit(request, ctx.publishableKeyId);

    const body = storefrontCreateQuoteSchema.parse(await request.json());
    const actor = createStorefrontActor(ctx.tenantId);

    const result = await createQuoteUseCase.execute(
      {
        tenantId: ctx.tenantId,
        holdId: body.holdId,
      },
      actor,
    );

    if (result.isFailure) {
      return mapStorefrontResultError(result.getError());
    }

    return storefrontSuccess(ctx, mapPublicQuote(result.getValue()), 201);
  } catch (error) {
    return storefrontError(error);
  }
}
