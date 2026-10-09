import type { Website } from "../domain/Website";
import type { WebsiteVersion } from "../domain/WebsiteVersion";

export interface IWebsiteRepository {
  save(website: Website): Promise<void>;
  findById(tenantId: string, websiteId: string): Promise<Website | null>;
  findByPropertyId(
    tenantId: string,
    propertyId: string,
  ): Promise<Website | null>;
}

export interface IWebsiteVersionRepository {
  save(version: WebsiteVersion): Promise<void>;
  findById(
    tenantId: string,
    versionId: string,
  ): Promise<WebsiteVersion | null>;
  findByWebsiteId(
    tenantId: string,
    websiteId: string,
  ): Promise<WebsiteVersion[]>;
  nextVersionNumber(tenantId: string, websiteId: string): Promise<number>;
}

/**
 * Atomic draft save: persist version content + website draft pointer + optional theme.
 * Implementations must run inside a single tenant RLS transaction and roll back on error.
 */
export interface SaveWebsiteDraftSnapshot {
  website: Website;
  draft: WebsiteVersion;
}

export interface PublishWebsiteSnapshot {
  website: Website;
  /** Frozen version now marked published. */
  published: WebsiteVersion;
  /** Previous published version marked superseded, if any. */
  superseded: WebsiteVersion | null;
  /** New draft row for continued editing (copy of published content). */
  nextDraft: WebsiteVersion;
}

/**
 * Persistence boundary for Website Builder transitions.
 *
 * A3 Prisma adapters MUST:
 * - Apply `publish` / `saveDraft` in one DB transaction (website pointers + versions).
 * - Lock the website row and assign `nextDraft.versionNumber` inside that TX
 *   (never trust a pre-transaction `nextVersionNumber` read).
 * - Clear draft/published pointers before deleting referenced versions (RESTRICT).
 * - Rely on A1 composite FKs for tenant/website/version integrity.
 *
 * On failure the transaction must leave no partial rows. Callers must discard
 * in-memory aggregates after a failed Result and reload from the repository.
 */
export interface IWebsiteUnitOfWork {
  saveDraft(snapshot: SaveWebsiteDraftSnapshot): Promise<void>;
  publish(snapshot: PublishWebsiteSnapshot): Promise<void>;
}
