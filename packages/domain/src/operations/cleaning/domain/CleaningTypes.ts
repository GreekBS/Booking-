/**
 * QR Cleaning V1 shared types (ADR-030).
 *
 * Scan/resolve uses SHA-256 tokenHash only. Authorized display/reprint may
 * recover plaintext via sealed tokenCiphertext (AES-GCM). Raw tokens are never
 * stored in plaintext. Photo bytes live in object storage.
 */

export const UNIT_QR_STATUSES = ["ACTIVE", "REVOKED"] as const;
export type UnitQrStatus = (typeof UNIT_QR_STATUSES)[number];

export const CLEANING_EXECUTION_STATUSES = ["IN_PROGRESS", "COMPLETED"] as const;
export type CleaningExecutionStatus =
  (typeof CLEANING_EXECUTION_STATUSES)[number];

/** Hard caps mirrored by validators, API routes and the `cleaning_photos` CHECK. */
export const CLEANING_PHOTO_MAX_PER_EXECUTION = 12;
export const CLEANING_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const CLEANING_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type CleaningPhotoContentType =
  (typeof CLEANING_PHOTO_CONTENT_TYPES)[number];

export const CLEANING_TEMPLATE_MAX_ITEMS = 60;
export const CLEANING_TEMPLATE_MAX_MINIMUM_PHOTOS = 50;

/** Title used when the QR flow opens a new ad-hoc housekeeping task. */
export const QR_MANUAL_CLEANING_TASK_TITLE = "Cleaning (QR)";

export function isCleaningPhotoContentType(
  value: string,
): value is CleaningPhotoContentType {
  return (CLEANING_PHOTO_CONTENT_TYPES as readonly string[]).includes(value);
}

export interface UnitQrAccessRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  tokenHash: string;
  /** AES-GCM sealed raw token; null on legacy hash-only rows. */
  tokenCiphertext: Uint8Array | null;
  tokenKeyVersion: number | null;
  status: UnitQrStatus;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export interface CleaningChecklistTemplateItemRecord {
  id: string;
  tenantId: string;
  templateId: string;
  label: string;
  description: string | null;
  position: number;
  required: boolean;
  photoRequired: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CleaningChecklistTemplateRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  isActive: boolean;
  version: number;
  minimumCompletionPhotos: number;
  createdAt: Date;
  updatedAt: Date;
  items: CleaningChecklistTemplateItemRecord[];
}

export interface CleaningExecutionItemRecord {
  id: string;
  tenantId: string;
  executionId: string;
  sourceTemplateItemId: string | null;
  labelSnapshot: string;
  descriptionSnapshot: string | null;
  position: number;
  required: boolean;
  photoRequired: boolean;
  checked: boolean;
  checkedAt: Date | null;
  checkedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CleaningPhotoRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string | null;
  cleaningLocationId?: string | null;
  taskId: string;
  executionId: string;
  executionItemId: string | null;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  createdAt: Date;
}

export interface CleaningExecutionRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  /** Legacy commercial unit; nullable for hotel locations without a Unit. */
  unitId: string | null;
  cleaningLocationId?: string | null;
  taskId: string;
  templateId: string | null;
  templateVersion: number | null;
  status: CleaningExecutionStatus;
  startedByUserId: string;
  startedAt: Date;
  completedByUserId: string | null;
  completedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Execution plus its immutable item snapshot and evidence photos. */
export interface CleaningExecutionDetail extends CleaningExecutionRecord {
  items: CleaningExecutionItemRecord[];
  photos: CleaningPhotoRecord[];
}

export interface UpsertChecklistTemplateItemInput {
  /** Existing item id to preserve, or null/undefined for a new line. */
  id?: string | null;
  label: string;
  description?: string | null;
  required?: boolean;
  photoRequired?: boolean;
}

export interface UpsertChecklistTemplateInput {
  tenantId: string;
  propertyId: string;
  name: string;
  minimumCompletionPhotos: number;
  items: UpsertChecklistTemplateItemInput[];
  actorUserId: string;
  now?: Date;
}
