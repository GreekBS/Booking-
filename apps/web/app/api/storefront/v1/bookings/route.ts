import { NextRequest } from "next/server";
import { storefrontCreateBookingSchema } from "@hcp/validators";
import { createStorefrontActor, ForbiddenError } from "@hcp/domain";
import {
  bookingRepository,
  createBookingUseCase,
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
import { mapPublicBooking } from "@/lib/storefront/storefront-mappers";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireStorefrontContext(request);
    checkStorefrontRateLimit(request, ctx.publishableKeyId);
    const idempotencyKey = requireIdempotencyKey(request);

    const raw = await request.json();
    if (raw && typeof raw === "object" && "guestId" in raw) {
      return storefrontError(new ForbiddenError());
    }
    const body = storefrontCreateBookingSchema.parse(raw);
    const actor = createStorefrontActor(ctx.tenantId);

    const existingResourceId = await storefrontIdempotencyRepository.findResourceId(
      ctx.tenantId,
      "booking",
      idempotencyKey,
    );
    if (existingResourceId) {
      const existingBooking = await bookingRepository.findById(
        existingResourceId,
        ctx.tenantId,
      );
      if (existingBooking) {
        return storefrontSuccess(ctx, mapPublicBooking(existingBooking));
      }
    }

    const result = await createBookingUseCase.execute(
      {
        tenantId: ctx.tenantId,
        quoteId: body.quoteId,
        guest: {
          name: body.guest.name,
          email: body.guest.email,
          phone: body.guest.phone ?? null,
        },
        confirmationMode: "manual",
      },
      actor,
    );

    if (result.isFailure) {
      return mapStorefrontResultError(result.getError());
    }

    const booking = result.getValue();
    await storefrontIdempotencyRepository.save(
      ctx.tenantId,
      "booking",
      idempotencyKey,
      booking.id,
      new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    );

    return storefrontSuccess(ctx, mapPublicBooking(booking), 201);
  } catch (error) {
    return storefrontError(error);
  }
}
