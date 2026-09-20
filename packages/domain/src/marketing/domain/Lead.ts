import { Entity } from "../../shared/kernel/Entity";
import { Email } from "../../shared/value-objects/Email";
import { ValidationError } from "../../shared/errors/DomainError";
import type {
  LeadAccommodationType,
  LeadChannel,
  LeadInterest,
  LeadOperatingState,
  LeadPortfolioSize,
  LeadRelationship,
  LeadRevenueRange,
  LeadSource,
  LeadStatus,
  LeadTool,
} from "./LeadTypes";
import { LEAD_STATUSES } from "./LeadTypes";

export interface LeadProps {
  id: string;
  submissionId: string;
  fullName: string;
  emailNormalized: string;
  phone: string | null;
  country: string;
  relationship: LeadRelationship;
  portfolioSize: LeadPortfolioSize;
  accommodationTypes: LeadAccommodationType[];
  propertyCountry: string;
  propertyCity: string | null;
  operatingState: LeadOperatingState;
  channels: LeadChannel[];
  tools: LeadTool[];
  softwareName: string | null;
  hasWebsite: boolean | null;
  acceptsDirectBookings: boolean | null;
  revenueRange: LeadRevenueRange | null;
  interests: LeadInterest[];
  message: string | null;
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  status: LeadStatus;
  /** When the prospect explicitly requested a demo. Independent of workflow status. */
  demoRequestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateLeadProps = Omit<
  LeadProps,
  "emailNormalized" | "status" | "demoRequestedAt" | "createdAt" | "updatedAt"
> & {
  email: string;
};

/**
 * Anonymous marketing prospect.
 * Must never imply User/Tenant/Membership identity.
 */
export class Lead extends Entity<LeadProps> {
  private constructor(props: LeadProps) {
    super(props);
  }

  get submissionId(): string {
    return this.props.submissionId;
  }

  get fullName(): string {
    return this.props.fullName;
  }

  get emailNormalized(): string {
    return this.props.emailNormalized;
  }

  get status(): LeadStatus {
    return this.props.status;
  }

  get source(): LeadSource {
    return this.props.source;
  }

  get interests(): LeadInterest[] {
    return [...this.props.interests];
  }

  get demoRequestedAt(): Date | null {
    return this.props.demoRequestedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  static create(props: CreateLeadProps): Lead {
    const now = new Date();
    const email = Email.create(props.email);

    return new Lead({
      id: props.id,
      submissionId: props.submissionId,
      fullName: props.fullName.trim(),
      emailNormalized: email.value,
      phone: props.phone?.trim() ? props.phone.trim() : null,
      country: props.country.trim(),
      relationship: props.relationship,
      portfolioSize: props.portfolioSize,
      accommodationTypes: [...props.accommodationTypes],
      propertyCountry: props.propertyCountry.trim(),
      propertyCity: props.propertyCity?.trim() ? props.propertyCity.trim() : null,
      operatingState: props.operatingState,
      channels: [...(props.channels ?? [])],
      tools: [...(props.tools ?? [])],
      softwareName: props.softwareName?.trim() ? props.softwareName.trim() : null,
      hasWebsite: props.hasWebsite ?? null,
      acceptsDirectBookings: props.acceptsDirectBookings ?? null,
      revenueRange: props.revenueRange ?? null,
      interests: [...props.interests],
      message: props.message?.trim() ? props.message.trim() : null,
      source: props.source,
      utmSource: props.utmSource?.trim() ? props.utmSource.trim() : null,
      utmMedium: props.utmMedium?.trim() ? props.utmMedium.trim() : null,
      utmCampaign: props.utmCampaign?.trim() ? props.utmCampaign.trim() : null,
      status: "new",
      demoRequestedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: LeadProps): Lead {
    return new Lead(props);
  }

  /**
   * Record that the prospect requested a demo.
   * Idempotent — preserves the original demoRequestedAt on retries.
   */
  requestDemo(at: Date = new Date()): void {
    if (this.props.demoRequestedAt) {
      return;
    }
    this.props.demoRequestedAt = at;
    this.props.updatedAt = at;
  }

  changeStatus(status: LeadStatus, at: Date = new Date()): void {
    if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
      throw new ValidationError(`Invalid lead status: ${status}`);
    }
    this.props.status = status;
    this.props.updatedAt = at;
  }

  toPersistence(): LeadProps {
    return {
      ...this.props,
      interests: [...this.props.interests],
      accommodationTypes: [...this.props.accommodationTypes],
      channels: [...this.props.channels],
      tools: [...this.props.tools],
    };
  }
}
