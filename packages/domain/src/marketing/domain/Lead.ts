import { Entity } from "../../shared/kernel/Entity";
import { Email } from "../../shared/value-objects/Email";
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
  createdAt: Date;
  updatedAt: Date;
}

export type CreateLeadProps = Omit<
  LeadProps,
  "emailNormalized" | "status" | "createdAt" | "updatedAt"
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
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: LeadProps): Lead {
    return new Lead(props);
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
