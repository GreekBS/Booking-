import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { Lead } from "../domain/Lead";
import type {
  LeadAccommodationType,
  LeadChannel,
  LeadInterest,
  LeadOperatingState,
  LeadPortfolioSize,
  LeadRelationship,
  LeadRevenueRange,
  LeadSource,
  LeadTool,
} from "../domain/LeadTypes";
import type { ILeadRepository } from "../ports/ILeadRepository";

export interface CreateLeadCommand {
  /** Opaque client UUID for this submission attempt (retry-safe). Not email-based. */
  submissionId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  country: string;
  relationship: LeadRelationship;
  portfolioSize: LeadPortfolioSize;
  accommodationTypes: LeadAccommodationType[];
  propertyCountry: string;
  propertyCity?: string | null;
  operatingState: LeadOperatingState;
  channels?: LeadChannel[];
  tools?: LeadTool[];
  softwareName?: string | null;
  hasWebsite?: boolean | null;
  acceptsDirectBookings?: boolean | null;
  revenueRange?: LeadRevenueRange | null;
  interests: LeadInterest[];
  message?: string | null;
  source: LeadSource;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

export interface CreateLeadResult {
  id: string;
}

/**
 * Persists an anonymous marketing Lead.
 * Does not create User, Tenant, Membership, or sessions.
 */
export class CreateLeadUseCase {
  constructor(
    private readonly leadRepository: ILeadRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: CreateLeadCommand,
  ): Promise<Result<CreateLeadResult, Error>> {
    try {
      if (!command.submissionId?.trim()) {
        return Result.fail(new ValidationError("submissionId is required"));
      }
      if (!command.accommodationTypes?.length) {
        return Result.fail(
          new ValidationError("At least one accommodation type is required"),
        );
      }
      if (!command.interests?.length) {
        return Result.fail(new ValidationError("At least one interest is required"));
      }

      const existing = await this.leadRepository.findBySubmissionId(
        command.submissionId,
      );
      if (existing) {
        return Result.ok({ id: existing.id });
      }

      const lead = Lead.create({
        id: this.idGenerator.generate(),
        submissionId: command.submissionId,
        fullName: command.fullName,
        email: command.email,
        phone: command.phone ?? null,
        country: command.country,
        relationship: command.relationship,
        portfolioSize: command.portfolioSize,
        accommodationTypes: command.accommodationTypes,
        propertyCountry: command.propertyCountry,
        propertyCity: command.propertyCity ?? null,
        operatingState: command.operatingState,
        channels: command.channels ?? [],
        tools: command.tools ?? [],
        softwareName: command.softwareName ?? null,
        hasWebsite: command.hasWebsite ?? null,
        acceptsDirectBookings: command.acceptsDirectBookings ?? null,
        revenueRange: command.revenueRange ?? null,
        interests: command.interests,
        message: command.message ?? null,
        source: command.source,
        utmSource: command.utmSource ?? null,
        utmMedium: command.utmMedium ?? null,
        utmCampaign: command.utmCampaign ?? null,
      });

      try {
        await this.leadRepository.create(lead);
      } catch (error) {
        // Concurrent retry of the same submissionId — return original Lead.
        const raced = await this.leadRepository.findBySubmissionId(
          command.submissionId,
        );
        if (raced) {
          return Result.ok({ id: raced.id });
        }
        throw error;
      }

      return Result.ok({ id: lead.id });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
