import { ValidationError } from "../../../shared/errors/DomainError";
import type {
  CleaningExecutionItemRecord,
  CleaningPhotoRecord,
} from "./CleaningTypes";

export interface CleaningCompletionBlocker {
  code:
    | "required_item_unchecked"
    | "item_photo_missing"
    | "minimum_photos_not_met";
  message: string;
  itemId?: string;
}

export interface CleaningCompletionReadiness {
  ready: boolean;
  blockers: CleaningCompletionBlocker[];
  photoCount: number;
  minimumCompletionPhotos: number;
}

/**
 * Pure completion gate. Evaluated both for UX (before submit) and
 * authoritatively inside the completion transaction.
 */
export function evaluateCleaningCompletion(input: {
  items: readonly CleaningExecutionItemRecord[];
  photos: readonly CleaningPhotoRecord[];
  minimumCompletionPhotos: number;
}): CleaningCompletionReadiness {
  const blockers: CleaningCompletionBlocker[] = [];
  const photoCount = input.photos.length;
  const photosByItem = new Map<string, number>();
  for (const photo of input.photos) {
    if (!photo.executionItemId) continue;
    photosByItem.set(
      photo.executionItemId,
      (photosByItem.get(photo.executionItemId) ?? 0) + 1,
    );
  }

  for (const item of input.items) {
    if (item.required && !item.checked) {
      blockers.push({
        code: "required_item_unchecked",
        message: `"${item.labelSnapshot}" is required`,
        itemId: item.id,
      });
      continue;
    }
    if (item.photoRequired && item.checked && (photosByItem.get(item.id) ?? 0) === 0) {
      blockers.push({
        code: "item_photo_missing",
        message: `"${item.labelSnapshot}" needs at least one photo`,
        itemId: item.id,
      });
    }
  }

  if (photoCount < input.minimumCompletionPhotos) {
    blockers.push({
      code: "minimum_photos_not_met",
      message: `At least ${input.minimumCompletionPhotos} photo${
        input.minimumCompletionPhotos === 1 ? "" : "s"
      } required to complete (${photoCount} uploaded)`,
    });
  }

  return {
    ready: blockers.length === 0,
    blockers,
    photoCount,
    minimumCompletionPhotos: input.minimumCompletionPhotos,
  };
}

export function assertCleaningCompletable(input: {
  items: readonly CleaningExecutionItemRecord[];
  photos: readonly CleaningPhotoRecord[];
  minimumCompletionPhotos: number;
}): void {
  const readiness = evaluateCleaningCompletion(input);
  if (readiness.ready) return;
  throw new ValidationError(
    readiness.blockers.map((b) => b.message).join("; "),
  );
}
