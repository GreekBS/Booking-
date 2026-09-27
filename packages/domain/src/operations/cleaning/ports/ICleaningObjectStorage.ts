/**
 * Private object storage for cleaning evidence photos.
 * Reads are always served through short-lived signed URLs — never public URLs.
 */
export interface ICleaningObjectStorage {
  /** Short identifier surfaced in diagnostics, e.g. "supabase" or "fs". */
  readonly driver: string;

  upload(input: {
    key: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<void>;

  createReadUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /** Must not throw when the object is already gone. */
  delete(key: string): Promise<void>;
}

/** Deterministic, tenant-partitioned key. Never derived from user input. */
export function buildCleaningPhotoStorageKey(input: {
  tenantId: string;
  propertyId: string;
  /** Legacy commercial unit; prefer cleaningLocationId when unit is absent. */
  unitId: string | null;
  cleaningLocationId?: string | null;
  executionId: string;
  photoId: string;
  contentType: string;
}): string {
  const ext =
    input.contentType === "image/png"
      ? "png"
      : input.contentType === "image/webp"
        ? "webp"
        : "jpg";
  const spaceKey =
    input.unitId ?? input.cleaningLocationId ?? "location";
  return `${input.tenantId}/${input.propertyId}/${spaceKey}/${input.executionId}/${input.photoId}.${ext}`;
}
