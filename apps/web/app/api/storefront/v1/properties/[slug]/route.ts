import { NextRequest } from "next/server";
import { getPublicPropertyBySlugUseCase } from "@/lib/di/container";
import {
  requireStorefrontContext,
} from "@/lib/storefront/storefront-context";
import { checkStorefrontRateLimit } from "@/lib/storefront/storefront-rate-limit";
import {
  mapStorefrontResultError,
  storefrontError,
  storefrontSuccess,
} from "@/lib/storefront/storefront-response";
import { mapPublicProperty } from "@/lib/storefront/storefront-mappers";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await requireStorefrontContext(request);
    checkStorefrontRateLimit(request, ctx.publishableKeyId);

    const { slug } = await context.params;
    const result = await getPublicPropertyBySlugUseCase.execute(ctx.tenantId, slug);

    if (result.isFailure) {
      return mapStorefrontResultError(result.getError());
    }

    return storefrontSuccess(ctx, mapPublicProperty(result.getValue()));
  } catch (error) {
    return storefrontError(error);
  }
}
