import type { Website, WebsiteVersion } from "@hcp/domain";

/**
 * JSON DTOs for Website Builder admin APIs.
 * Richtext `body` is returned as an opaque string — never rendered as HTML here.
 * Public/preview HTML must sanitize at the render boundary (see validators contract).
 */

export function serializeWebsite(website: Website) {
  return {
    id: website.id,
    tenantId: website.tenantId,
    propertyId: website.propertyId,
    status: website.status,
    themeId: website.themeId,
    contentSchemaVersion: website.contentSchemaVersion,
    draftVersionId: website.draftVersionId,
    publishedVersionId: website.publishedVersionId,
    createdAt: website.createdAt.toISOString(),
    updatedAt: website.updatedAt.toISOString(),
  };
}

export function serializeWebsiteVersion(version: WebsiteVersion) {
  return {
    id: version.id,
    tenantId: version.tenantId,
    websiteId: version.websiteId,
    versionNumber: version.versionNumber,
    locale: version.locale,
    /** Opaque JSON — do not interpret richtext as HTML in API responses. */
    sections: version.sections,
    seo: version.seo,
    state: version.state,
    publishedAt: version.publishedAt?.toISOString() ?? null,
    publishedBy: version.publishedBy,
    createdAt: version.createdAt.toISOString(),
  };
}
