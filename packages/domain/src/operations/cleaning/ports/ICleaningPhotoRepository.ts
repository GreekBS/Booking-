import type { CleaningPhotoRecord } from "../domain/CleaningTypes";

export interface RegisterCleaningPhotoCommand {
  tenantId: string;
  executionId: string;
  executionItemId: string | null;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  now?: Date;
}

export interface ICleaningPhotoRepository {
  listByExecution(
    tenantId: string,
    executionId: string,
  ): Promise<CleaningPhotoRecord[]>;

  findById(tenantId: string, photoId: string): Promise<CleaningPhotoRecord | null>;

  /**
   * Insert the photo row, enforcing the per-execution cap and the
   * IN_PROGRESS execution precondition inside one transaction.
   */
  register(
    command: RegisterCleaningPhotoCommand,
  ): Promise<CleaningPhotoRecord>;

  /** Removes the row and returns it so the caller can delete the object. */
  remove(tenantId: string, photoId: string): Promise<CleaningPhotoRecord | null>;
}
