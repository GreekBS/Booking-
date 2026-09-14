import type { ActorContext } from "../../shared/services/PermissionChecker";

export interface StorefrontContext {
  tenantId: string;
  publishableKeyId: string;
  environment: "test" | "live";
  allowedDomains: string[];
  locale: string;
  requestId: string;
}

export function createStorefrontActor(tenantId: string): ActorContext {
  return {
    userId: `storefront:${tenantId}`,
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };
}
