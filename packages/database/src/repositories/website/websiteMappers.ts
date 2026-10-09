import type { Prisma } from "@prisma/client";
import {
  Website,
  WebsiteVersion,
  isWebsiteStatus,
  isWebsiteThemeId,
  isWebsiteVersionState,
  type WebsiteStatus,
  type WebsiteThemeId,
  type WebsiteVersionState,
} from "@hcp/domain";

type WebsiteRow = {
  id: string;
  tenantId: string;
  propertyId: string;
  status: string;
  themeId: string;
  contentSchemaVersion: number;
  draftVersionId: string | null;
  publishedVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type WebsiteVersionRow = {
  id: string;
  tenantId: string;
  websiteId: string;
  versionNumber: number;
  locale: string;
  sections: Prisma.JsonValue;
  seo: Prisma.JsonValue;
  state: string;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
};

export function mapWebsite(row: WebsiteRow): Website {
  if (!isWebsiteStatus(row.status)) {
    throw new Error(`Invalid website status in DB: ${row.status}`);
  }
  if (!isWebsiteThemeId(row.themeId)) {
    throw new Error(`Invalid website themeId in DB: ${row.themeId}`);
  }
  return Website.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    status: row.status,
    themeId: row.themeId,
    contentSchemaVersion: row.contentSchemaVersion,
    draftVersionId: row.draftVersionId,
    publishedVersionId: row.publishedVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function mapWebsiteVersion(row: WebsiteVersionRow): WebsiteVersion {
  if (!isWebsiteVersionState(row.state)) {
    throw new Error(`Invalid website version state in DB: ${row.state}`);
  }
  return WebsiteVersion.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    websiteId: row.websiteId,
    versionNumber: row.versionNumber,
    locale: row.locale,
    sections: row.sections ?? [],
    seo: row.seo ?? {},
    state: row.state,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
    createdAt: row.createdAt,
  });
}

export function websiteCreateData(website: Website) {
  return {
    id: website.id,
    tenantId: website.tenantId,
    propertyId: website.propertyId,
    status: website.status as WebsiteStatus,
    themeId: website.themeId as WebsiteThemeId,
    contentSchemaVersion: website.contentSchemaVersion,
    draftVersionId: website.draftVersionId,
    publishedVersionId: website.publishedVersionId,
    createdAt: website.createdAt,
    updatedAt: website.updatedAt,
  };
}

export function websiteVersionCreateData(version: WebsiteVersion) {
  return {
    id: version.id,
    tenantId: version.tenantId,
    websiteId: version.websiteId,
    versionNumber: version.versionNumber,
    locale: version.locale,
    sections: version.sections as Prisma.InputJsonValue,
    seo: version.seo as Prisma.InputJsonValue,
    state: version.state as WebsiteVersionState,
    publishedAt: version.publishedAt,
    publishedBy: version.publishedBy,
    createdAt: version.createdAt,
  };
}
