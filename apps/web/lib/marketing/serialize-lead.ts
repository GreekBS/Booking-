import type { Lead } from "@hcp/domain";

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** Compact row for Platform Admin Leads list. */
export function serializeLeadSummary(lead: Lead) {
  const p = lead.toPersistence();
  return {
    id: p.id,
    fullName: p.fullName,
    email: p.emailNormalized,
    phone: p.phone,
    country: p.country,
    portfolioSize: p.portfolioSize,
    interests: [...p.interests],
    source: p.source,
    status: p.status,
    demoRequested: p.demoRequestedAt != null,
    demoRequestedAt: iso(p.demoRequestedAt),
    createdAt: p.createdAt.toISOString(),
  };
}

/** Full Lead payload for Platform Admin detail. */
export function serializeLeadDetail(lead: Lead) {
  const p = lead.toPersistence();
  return {
    id: p.id,
    submissionId: p.submissionId,
    fullName: p.fullName,
    email: p.emailNormalized,
    phone: p.phone,
    country: p.country,
    relationship: p.relationship,
    portfolioSize: p.portfolioSize,
    accommodationTypes: [...p.accommodationTypes],
    propertyCountry: p.propertyCountry,
    propertyCity: p.propertyCity,
    operatingState: p.operatingState,
    channels: [...p.channels],
    tools: [...p.tools],
    softwareName: p.softwareName,
    hasWebsite: p.hasWebsite,
    acceptsDirectBookings: p.acceptsDirectBookings,
    revenueRange: p.revenueRange,
    interests: [...p.interests],
    message: p.message,
    source: p.source,
    utmSource: p.utmSource,
    utmMedium: p.utmMedium,
    utmCampaign: p.utmCampaign,
    status: p.status,
    demoRequested: p.demoRequestedAt != null,
    demoRequestedAt: iso(p.demoRequestedAt),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
