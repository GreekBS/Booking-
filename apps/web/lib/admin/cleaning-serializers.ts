import type {
  CleaningChecklistTemplateRecord,
  CleaningExecutionDetail,
  CleaningExecutionItemRecord,
  CleaningHistoryEntry,
  CleaningPhotoView,
} from "@hcp/domain";

/** Wire shapes for the QR Cleaning admin API (ADR-030). */

export function serializeCleaningItem(item: CleaningExecutionItemRecord) {
  return {
    id: item.id,
    executionId: item.executionId,
    sourceTemplateItemId: item.sourceTemplateItemId,
    label: item.labelSnapshot,
    description: item.descriptionSnapshot,
    position: item.position,
    required: item.required,
    photoRequired: item.photoRequired,
    checked: item.checked,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    checkedByUserId: item.checkedByUserId,
  };
}

export function serializeCleaningPhoto(photo: CleaningPhotoView) {
  return {
    id: photo.id,
    executionId: photo.executionId,
    executionItemId: photo.executionItemId,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    uploadedByUserId: photo.uploadedByUserId,
    createdAt: photo.createdAt.toISOString(),
    url: photo.url,
  };
}

export function serializeCleaningExecution(
  execution: CleaningExecutionDetail,
  photos: CleaningPhotoView[],
) {
  return {
    id: execution.id,
    tenantId: execution.tenantId,
    propertyId: execution.propertyId,
    unitId: execution.unitId,
    taskId: execution.taskId,
    templateId: execution.templateId,
    templateVersion: execution.templateVersion,
    status: execution.status,
    startedByUserId: execution.startedByUserId,
    startedAt: execution.startedAt.toISOString(),
    completedByUserId: execution.completedByUserId,
    completedAt: execution.completedAt?.toISOString() ?? null,
    version: execution.version,
    items: execution.items.map(serializeCleaningItem),
    photos: photos.map(serializeCleaningPhoto),
  };
}

export function serializeCleaningTemplate(
  template: CleaningChecklistTemplateRecord,
) {
  return {
    id: template.id,
    propertyId: template.propertyId,
    name: template.name,
    version: template.version,
    minimumCompletionPhotos: template.minimumCompletionPhotos,
    updatedAt: template.updatedAt.toISOString(),
    items: template.items
      .filter((item) => item.isActive)
      .map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        position: item.position,
        required: item.required,
        photoRequired: item.photoRequired,
      })),
  };
}

export function serializeCleaningHistoryEntry(entry: CleaningHistoryEntry) {
  return {
    id: entry.id,
    propertyId: entry.propertyId,
    propertyName: entry.propertyName,
    unitId: entry.unitId,
    unitName: entry.unitName,
    taskId: entry.taskId,
    taskTitle: entry.taskTitle,
    status: entry.status,
    startedByUserId: entry.startedByUserId,
    startedAt: entry.startedAt.toISOString(),
    completedByUserId: entry.completedByUserId,
    completedAt: entry.completedAt?.toISOString() ?? null,
    itemsTotal: entry.itemsTotal,
    itemsChecked: entry.itemsChecked,
    photoCount: entry.photoCount,
  };
}
