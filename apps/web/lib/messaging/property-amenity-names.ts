/**
 * Amenity display names for AI context.
 * V1: empty allow-list — Property AI Knowledge + policies cover guest facts.
 * Kept as an injectable seam so a DI-backed reader can fill this later.
 */
export async function loadPropertyAmenityNames(
  tenantId: string,
  propertyId: string,
): Promise<string[]> {
  void tenantId;
  void propertyId;
  return [];
}
