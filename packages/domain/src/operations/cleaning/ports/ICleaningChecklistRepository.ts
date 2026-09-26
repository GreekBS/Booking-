import type {
  CleaningChecklistTemplateRecord,
  UpsertChecklistTemplateInput,
} from "../domain/CleaningTypes";

export interface ICleaningChecklistRepository {
  findActiveTemplateByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<CleaningChecklistTemplateRecord | null>;

  /**
   * Create or replace the single ACTIVE template for a property.
   * Items absent from the payload are deactivated rather than deleted so
   * existing execution snapshots keep resolving their source item.
   */
  upsertActiveTemplate(
    input: UpsertChecklistTemplateInput,
  ): Promise<CleaningChecklistTemplateRecord>;
}
