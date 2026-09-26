import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ICleaningObjectStorage } from "@hcp/domain";

export const CLEANING_PHOTOS_BUCKET_ENV = "CLEANING_PHOTOS_BUCKET";
export const DEFAULT_CLEANING_PHOTOS_BUCKET = "cleaning-photos";
export const DEFAULT_CLEANING_SIGNED_URL_TTL_SECONDS = 300;

export interface SupabaseCleaningObjectStorageOptions {
  url: string;
  serviceRoleKey: string;
  bucket?: string;
  defaultSignedUrlTtlSeconds?: number;
}

/**
 * Private-bucket storage backed by Supabase Storage.
 *
 * Uploads use the service role key (server only — never exposed to the browser)
 * and reads are always short-lived signed URLs, so the bucket stays private.
 */
export class SupabaseCleaningObjectStorage implements ICleaningObjectStorage {
  readonly driver = "supabase";

  private readonly client: SupabaseClient;
  private readonly bucket: string;
  private readonly ttlSeconds: number;

  constructor(options: SupabaseCleaningObjectStorageOptions) {
    this.client = createClient(options.url, options.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.bucket = options.bucket?.trim() || DEFAULT_CLEANING_PHOTOS_BUCKET;
    this.ttlSeconds =
      options.defaultSignedUrlTtlSeconds ??
      DEFAULT_CLEANING_SIGNED_URL_TTL_SECONDS;
  }

  async upload(input: {
    key: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(input.key, input.body, {
        contentType: input.contentType,
        upsert: false,
      });
    if (error) {
      throw new Error(`Cleaning photo upload failed: ${error.message}`);
    }
  }

  async createReadUrl(key: string, expiresInSeconds?: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresInSeconds ?? this.ttlSeconds);
    if (error || !data?.signedUrl) {
      throw new Error(
        `Cleaning photo signed URL failed: ${error?.message ?? "no URL returned"}`,
      );
    }
    return data.signedUrl;
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error && !/not.?found/i.test(error.message)) {
      throw new Error(`Cleaning photo delete failed: ${error.message}`);
    }
  }
}
