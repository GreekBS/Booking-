import { elCommon } from "./el";

/**
 * Internal default unit name created with every property (domain catalog).
 * Keep this string aligned with Property.create — presentation only remaps it.
 */
export const INTERNAL_ENTIRE_PROPERTY_UNIT_NAME = "Entire Property";

/**
 * Customer-facing unit label. Maps the default whole-property unit to Greek
 * without renaming persisted/catalog values.
 */
export function displayUnitName(name: string | null | undefined): string {
  if (name == null) return "—";
  const trimmed = name.trim();
  if (!trimmed) return "—";
  if (trimmed === INTERNAL_ENTIRE_PROPERTY_UNIT_NAME) {
    return elCommon.entireProperty;
  }
  return trimmed;
}
