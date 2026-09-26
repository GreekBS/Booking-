import type { ICleaningObjectStorage } from "@hcp/domain";
import {
  DEFAULT_CLEANING_PHOTOS_BUCKET,
  SupabaseCleaningObjectStorage,
} from "./SupabaseCleaningObjectStorage";
import { LocalFsCleaningObjectStorage } from "./LocalFsCleaningObjectStorage";

export const CLEANING_PHOTOS_DRIVER_ENV = "CLEANING_PHOTOS_DRIVER";
export const CLEANING_PHOTOS_FS_ROOT_ENV = "CLEANING_PHOTOS_FS_ROOT";

export class CleaningObjectStorageUnavailableError extends Error {
  readonly code = "CLEANING_STORAGE_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "CleaningObjectStorageUnavailableError";
  }
}

/**
 * Placeholder used when no driver is configured. Every operation fails loudly
 * rather than silently dropping evidence photos.
 */
export class UnconfiguredCleaningObjectStorage implements ICleaningObjectStorage {
  readonly driver = "unconfigured";

  private fail(): never {
    throw new CleaningObjectStorageUnavailableError(
      `Cleaning photo storage is not configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or ${CLEANING_PHOTOS_DRIVER_ENV}=fs for local demos.`,
    );
  }

  async upload(): Promise<void> {
    this.fail();
  }

  async createReadUrl(): Promise<string> {
    this.fail();
  }

  async delete(): Promise<void> {
    this.fail();
  }
}

/**
 * Driver resolution order:
 *   1. `CLEANING_PHOTOS_DRIVER=fs`      → local filesystem (demo / verification)
 *   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → private Supabase bucket
 *   3. neither                          → fail-loud placeholder
 */
export function createCleaningObjectStorage(options?: {
  env?: NodeJS.ProcessEnv;
  fsRoot?: string;
}): ICleaningObjectStorage {
  const env = options?.env ?? process.env;
  const driver = env[CLEANING_PHOTOS_DRIVER_ENV]?.trim().toLowerCase();

  if (driver === "fs") {
    const root = env[CLEANING_PHOTOS_FS_ROOT_ENV]?.trim() || options?.fsRoot;
    return root
      ? new LocalFsCleaningObjectStorage(root)
      : new LocalFsCleaningObjectStorage();
  }

  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && serviceRoleKey) {
    return new SupabaseCleaningObjectStorage({
      url,
      serviceRoleKey,
      bucket: env.CLEANING_PHOTOS_BUCKET?.trim() || DEFAULT_CLEANING_PHOTOS_BUCKET,
    });
  }

  return new UnconfiguredCleaningObjectStorage();
}
