/**
 * CHANNELS_INVENTORY_APPLY_ENABLED — default false (Mode A / L1).
 * When false: P1-S5 cursor CAS only; no generation / inventory outbox.
 *
 * P1-S7c L2: connection.inventoryApplyEnabled must also be true for mutation.
 */

export function isChannelInventoryApplyEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env.CHANNELS_INVENTORY_APPLY_ENABLED === "true";
}

export function isCompleteChannelMappingTarget(mapping: {
  propertyId: string;
  unitId: string;
}): boolean {
  return mapping.propertyId.trim().length > 0 && mapping.unitId.trim().length > 0;
}

/**
 * Structural mutation predicate (fail-closed).
 * Does NOT include transient job health (dead-letters, stuck jobs).
 */
export function mayMutateIcalInventory(input: {
  globalApplyEnabled: boolean;
  inventoryApplyEnabled: boolean;
  status: string;
  provider: string;
  semanticMode: string;
  activeMappings: ReadonlyArray<{ propertyId: string; unitId: string }>;
}): boolean {
  if (!input.globalApplyEnabled) return false;
  if (!input.inventoryApplyEnabled) return false;
  if (input.status !== "active") return false;
  if (input.provider !== "ical") return false;
  if (input.semanticMode !== "availability_block_feed") return false;
  if (input.activeMappings.length !== 1) return false;
  return isCompleteChannelMappingTarget(input.activeMappings[0]!);
}

/**
 * Live inventoryApplyEffective health semantics (same structural gates).
 */
export function isInventoryApplyEffective(input: {
  globalApplyEnabled: boolean;
  inventoryApplyEnabled: boolean;
  status: string;
  provider: string;
  semanticMode: string;
  activeMappings: ReadonlyArray<{ propertyId: string; unitId: string }>;
}): boolean {
  return mayMutateIcalInventory(input);
}
