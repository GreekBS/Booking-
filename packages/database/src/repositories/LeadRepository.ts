import { Prisma } from "@prisma/client";
import type { ILeadRepository, LeadProps } from "@hcp/domain";
import { Lead } from "@hcp/domain";
import { prisma, type PrismaTransactionClient } from "../client";
import type { PrismaClient } from "@prisma/client";

type LeadDatabaseClient = PrismaClient | PrismaTransactionClient;

function toDomain(row: {
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
  createdAt: Date;
  updatedAt: Date;
}): Lead {
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
    return toDomain(row);
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
}
