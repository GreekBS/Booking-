import { Prisma } from "@prisma/client";
import type { ILeadRepository, LeadProps, ListLeadsQuery, ListLeadsResult } from "@hcp/domain";
import { Lead, type LeadStatus } from "@hcp/domain";
import { prisma, type PrismaTransactionClient } from "../client";
import type { PrismaClient } from "@prisma/client";

type LeadDatabaseClient = PrismaClient | PrismaTransactionClient;

type LeadRow = {
  id: string;
  submissionId: string;
  fullName: string;
  emailNormalized: string;
  phone: string | null;
  country: string;
  relationship: LeadProps["relationship"];
  portfolioSize: LeadProps["portfolioSize"];
  accommodationTypes: LeadProps["accommodationTypes"];
  propertyCountry: string;
  propertyCity: string | null;
  operatingState: LeadProps["operatingState"];
  channels: LeadProps["channels"];
  tools: LeadProps["tools"];
  softwareName: string | null;
  hasWebsite: boolean | null;
  acceptsDirectBookings: boolean | null;
  revenueRange: LeadProps["revenueRange"];
  interests: LeadProps["interests"];
  message: string | null;
  source: LeadProps["source"];
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  status: LeadProps["status"];
  demoRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDomain(row: LeadRow): Lead {
  return Lead.reconstitute({
    id: row.id,
    submissionId: row.submissionId,
    fullName: row.fullName,
    emailNormalized: row.emailNormalized,
    phone: row.phone,
    country: row.country,
    relationship: row.relationship,
    portfolioSize: row.portfolioSize,
    accommodationTypes: [...row.accommodationTypes],
    propertyCountry: row.propertyCountry,
    propertyCity: row.propertyCity,
    operatingState: row.operatingState,
    channels: [...row.channels],
    tools: [...row.tools],
    softwareName: row.softwareName,
    hasWebsite: row.hasWebsite,
    acceptsDirectBookings: row.acceptsDirectBookings,
    revenueRange: row.revenueRange,
    interests: [...row.interests],
    message: row.message,
    source: row.source,
    utmSource: row.utmSource,
    utmMedium: row.utmMedium,
    utmCampaign: row.utmCampaign,
    status: row.status,
    demoRequestedAt: row.demoRequestedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaLeadRepository implements ILeadRepository {
  constructor(private readonly client: LeadDatabaseClient = prisma) {}

  async findBySubmissionId(submissionId: string): Promise<Lead | null> {
    const row = await this.client.lead.findUnique({
      where: { submissionId },
    });
    if (!row) return null;
    return toDomain(row as LeadRow);
  }

  async findById(id: string): Promise<Lead | null> {
    const row = await this.client.lead.findUnique({
      where: { id },
    });
    if (!row) return null;
    return toDomain(row as LeadRow);
  }

  async list(query: ListLeadsQuery): Promise<ListLeadsResult> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.client.lead.findMany({
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.client.lead.count(),
    ]);

    // Stable operational presentation order within the page (NEW → demo → recent).
    const pageRows = (rows as LeadRow[]).slice();
    if (query.prioritizeOperational !== false) {
      pageRows.sort((a, b) => {
        const aNew = a.status === "new" ? 0 : 1;
        const bNew = b.status === "new" ? 0 : 1;
        if (aNew !== bNew) return aNew - bNew;
        const aDemo = a.demoRequestedAt ? 0 : 1;
        const bDemo = b.demoRequestedAt ? 0 : 1;
        if (aDemo !== bDemo) return aDemo - bDemo;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }

    return {
      data: pageRows.map(toDomain),
      total,
      page,
      limit,
    };
  }

  async create(lead: Lead): Promise<void> {
    const props = lead.toPersistence();
    try {
      await this.client.lead.create({
        data: {
          id: props.id,
          submissionId: props.submissionId,
          fullName: props.fullName,
          emailNormalized: props.emailNormalized,
          phone: props.phone,
          country: props.country,
          relationship: props.relationship,
          portfolioSize: props.portfolioSize,
          accommodationTypes: props.accommodationTypes,
          propertyCountry: props.propertyCountry,
          propertyCity: props.propertyCity,
          operatingState: props.operatingState,
          channels: props.channels,
          tools: props.tools,
          softwareName: props.softwareName,
          hasWebsite: props.hasWebsite,
          acceptsDirectBookings: props.acceptsDirectBookings,
          revenueRange: props.revenueRange,
          interests: props.interests,
          message: props.message,
          source: props.source,
          utmSource: props.utmSource,
          utmMedium: props.utmMedium,
          utmCampaign: props.utmCampaign,
          status: props.status,
          demoRequestedAt: props.demoRequestedAt,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw error;
      }
      throw error;
    }
  }

  async markDemoRequested(id: string, at: Date): Promise<Lead | null> {
    // Idempotent: only set when currently null.
    const result = await this.client.lead.updateMany({
      where: { id, demoRequestedAt: null },
      data: { demoRequestedAt: at },
    });

    if (result.count === 0) {
      // Either missing or already requested — return current row if present.
      return this.findById(id);
    }
    return this.findById(id);
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    try {
      const row = await this.client.lead.update({
        where: { id },
        data: { status },
      });
      return toDomain(row as LeadRow);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        return null;
      }
      throw error;
    }
  }
}
