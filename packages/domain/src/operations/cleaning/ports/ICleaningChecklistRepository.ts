import type {
  CleaningChecklistTemplateRecord,
  UpsertChecklistTemplateInput,
} from "../domain/CleaningTypes";

export interface EnsureDefaultChecklistTemplateInput {
  tenantId: string;
  propertyId: string;
  actorUserId: string;
  now?: Date;
}

export interface EnsureDefaultChecklistTemplateResult {
  template: CleaningChecklistTemplateRecord;
  /** True only when this call created the ACTIVE template. */
  created: boolean;
}

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

  /**
   * If the property already has an ACTIVE checklist, return it unchanged.
   * Otherwise create the built-in default checklist exactly once (serialized
   * per property). Never restores deleted/default items after customization.
   */
  ensureDefaultActiveTemplate(
    input: EnsureDefaultChecklistTemplateInput,
  ): Promise<EnsureDefaultChecklistTemplateResult>;
}
