import { AdminApiError, adminFetch } from "@/lib/admin/api";

export { AdminApiError };

export type WebsiteRecord = {
  id: string;
  tenantId: string;
  propertyId: string;
  status: string;
  themeId: string;
  contentSchemaVersion: number;
  draftVersionId: string | null;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WebsiteVersionRecord = {
  id: string;
  tenantId: string;
  websiteId: string;
  versionNumber: number;
  locale: string;
  sections: unknown;
  seo: unknown;
  state: string;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
};

export type WebsiteBundle = {
  website: WebsiteRecord;
  draft: WebsiteVersionRecord | null;
  published: WebsiteVersionRecord | null;
};

export function formatWebsiteApiError(err: unknown): string {
  if (err instanceof AdminApiError) {
    if (err.status === 403) {
      return "Δεν έχετε δικαίωμα πρόσβασης στον ιστότοπο αυτού του καταλύματος.";
    }
    if (err.status === 401) {
      return "Απαιτείται σύνδεση.";
    }
    if (err.status === 409) {
      return "Το αίτημα συγκρούστηκε με άλλη ενημέρωση. Ανανεώστε και δοκιμάστε ξανά.";
    }
    return err.message || "Αποτυχία αιτήματος ιστότοπου.";
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Αποτυχία αιτήματος ιστότοπου.";
}

export async function getWebsiteBundle(
  tenantId: string,
  propertyId: string,
): Promise<WebsiteBundle | null> {
  try {
    return await adminFetch<WebsiteBundle>(
      `/properties/${encodeURIComponent(propertyId)}/website`,
      { tenantId },
    );
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function ensureWebsite(
  tenantId: string,
  propertyId: string,
  themeId?: string,
): Promise<{ website: WebsiteRecord; draft: WebsiteVersionRecord }> {
  return adminFetch(`/properties/${encodeURIComponent(propertyId)}/website`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(themeId ? { themeId } : {}),
  });
}
