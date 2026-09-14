import type { ActorContext } from "../../shared/services/PermissionChecker";

export function createChannelImportActor(tenantId: string): ActorContext {
  return {
    userId: `channel:import:${tenantId}`,
    role: "admin",
    propertyIds: null,
    isSuperAdmin: false,
  };
}
