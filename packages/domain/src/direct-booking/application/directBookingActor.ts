import type { ActorContext } from "../../shared/services/PermissionChecker";

/**
 * Synthetic public actor for Direct Booking mutate paths.
 * Prefixed so CreateBookingUseCase treats the caller as public (no guestId, direct origin).
 */
export function createDirectBookingActor(tenantId: string): ActorContext {
  return {
    userId: `direct-booking:${tenantId}`,
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };
}

export function isDirectBookingPublicActor(actor: ActorContext): boolean {
  return actor.userId.startsWith("direct-booking:");
}

export function isPublicCommerceActor(actor: ActorContext): boolean {
  return actor.userId.startsWith("storefront:") || isDirectBookingPublicActor(actor);
}
