import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import type {
  AccommodationType,
  PropertyClassification,
} from "../../billing/tax/TaxRule";

export interface FiscalAddress {
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
}

export interface BusinessFiscalProfileProps {
  id: string;
  tenantId: string;
  /** Linked establishment / property. One tenant may have many. */
  propertyId: string;
  legalName: string;
  tradeName: string | null;
  country: string;
  /** Greek AFM / VAT number — required for Greek fiscalization later. */
  vatNumber: string | null;
  address: FiscalAddress;
  /**
   * Fiscal jurisdiction code used by TaxEngine (e.g. GR, GR-ISLAND-REDUCED).
   * Operator-assigned from verified eligibility — never auto-guessed.
   */
  fiscalJurisdiction: string;
  /** Optional establishment / branch identity for later fiscal docs. */
  establishmentCode: string | null;
  accommodationType: AccommodationType;
  propertyClassification: PropertyClassification | null;
  floorAreaSqm: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class BusinessFiscalProfile extends AggregateRoot<BusinessFiscalProfileProps> {
  private constructor(props: BusinessFiscalProfileProps) {
    super(props);
  }

  static create(
    input: Omit<BusinessFiscalProfileProps, "createdAt" | "updatedAt"> & {
      now?: Date;
    },
  ): BusinessFiscalProfile {
    const now = input.now ?? new Date();
    validateAddress(input.address);
    const country = input.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new ValidationError("Invalid business fiscal country");
    }
    if (!input.legalName.trim()) {
      throw new ValidationError("legalName required");
    }
    if (!input.fiscalJurisdiction.trim()) {
      throw new ValidationError("fiscalJurisdiction required");
    }
    if (country === "GR" && input.vatNumber) {
      assertGreekAfmFormat(input.vatNumber);
    }
    return new BusinessFiscalProfile({
      ...input,
      country,
      legalName: input.legalName.trim(),
      tradeName: input.tradeName?.trim() || null,
      fiscalJurisdiction: input.fiscalJurisdiction.trim(),
      establishmentCode: input.establishmentCode?.trim() || null,
      vatNumber: input.vatNumber?.trim() || null,
      address: normalizeAddress(input.address),
      metadata: { ...input.metadata },
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: BusinessFiscalProfileProps): BusinessFiscalProfile {
    return new BusinessFiscalProfile({
      ...props,
      address: { ...props.address },
      metadata: { ...props.metadata },
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get propertyId(): string {
    return this.props.propertyId;
  }
  get legalName(): string {
    return this.props.legalName;
  }
  get tradeName(): string | null {
    return this.props.tradeName;
  }
  get country(): string {
    return this.props.country;
  }
  get vatNumber(): string | null {
    return this.props.vatNumber;
  }
  get address(): FiscalAddress {
    return { ...this.props.address };
  }
  get fiscalJurisdiction(): string {
    return this.props.fiscalJurisdiction;
  }
  get establishmentCode(): string | null {
    return this.props.establishmentCode;
  }
  get accommodationType(): AccommodationType {
    return this.props.accommodationType;
  }
  get propertyClassification(): PropertyClassification | null {
    return this.props.propertyClassification;
  }
  get floorAreaSqm(): number | null {
    return this.props.floorAreaSqm;
  }
  get metadata(): Record<string, unknown> {
    return { ...this.props.metadata };
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  toProps(): BusinessFiscalProfileProps {
    return {
      ...this.props,
      address: { ...this.props.address },
      metadata: { ...this.props.metadata },
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  update(
    patch: Partial<
      Omit<BusinessFiscalProfileProps, "id" | "tenantId" | "propertyId" | "createdAt">
    >,
  ): void {
    if (patch.legalName !== undefined) {
      if (!patch.legalName.trim()) throw new ValidationError("legalName required");
      this.props.legalName = patch.legalName.trim();
    }
    if (patch.tradeName !== undefined) {
      this.props.tradeName = patch.tradeName?.trim() || null;
    }
    if (patch.country !== undefined) {
      const c = patch.country.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(c)) throw new ValidationError("Invalid country");
      this.props.country = c;
    }
    if (patch.vatNumber !== undefined) {
      const v = patch.vatNumber?.trim() || null;
      if (v && (patch.country ?? this.props.country) === "GR") {
        assertGreekAfmFormat(v);
      }
      this.props.vatNumber = v;
    }
    if (patch.address !== undefined) {
      validateAddress(patch.address);
      this.props.address = normalizeAddress(patch.address);
    }
    if (patch.fiscalJurisdiction !== undefined) {
      if (!patch.fiscalJurisdiction.trim()) {
        throw new ValidationError("fiscalJurisdiction required");
      }
      this.props.fiscalJurisdiction = patch.fiscalJurisdiction.trim();
    }
    if (patch.establishmentCode !== undefined) {
      this.props.establishmentCode = patch.establishmentCode?.trim() || null;
    }
    if (patch.accommodationType !== undefined) {
      this.props.accommodationType = patch.accommodationType;
    }
    if (patch.propertyClassification !== undefined) {
      this.props.propertyClassification = patch.propertyClassification;
    }
    if (patch.floorAreaSqm !== undefined) {
      this.props.floorAreaSqm = patch.floorAreaSqm;
    }
    if (patch.metadata !== undefined) {
      this.props.metadata = { ...patch.metadata };
    }
    this.props.updatedAt = new Date();
  }

  /** Fail-closed checks before climate/VAT evaluation for this establishment. */
  assertReadyForTaxEvaluation(): void {
    if (!this.props.fiscalJurisdiction) {
      throw new ValidationError("BusinessFiscalProfile missing fiscalJurisdiction");
    }
    if (
      this.props.accommodationType === "hotel" &&
      (!this.props.propertyClassification ||
        this.props.propertyClassification === "unclassified")
    ) {
      throw new ValidationError(
        "Hotel BusinessFiscalProfile requires hotel star classification",
      );
    }
  }
}

export type CustomerBillingType = "INDIVIDUAL" | "BUSINESS";

export interface CustomerBillingProfileProps {
  id: string;
  tenantId: string;
  type: CustomerBillingType;
  legalName: string;
  vatNumber: string | null;
  country: string;
  address: FiscalAddress;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CustomerBillingProfile extends AggregateRoot<CustomerBillingProfileProps> {
  private constructor(props: CustomerBillingProfileProps) {
    super(props);
  }

  static create(
    input: Omit<CustomerBillingProfileProps, "createdAt" | "updatedAt"> & {
      now?: Date;
    },
  ): CustomerBillingProfile {
    const now = input.now ?? new Date();
    validateAddress(input.address);
    if (!input.legalName.trim()) {
      throw new ValidationError("Customer legalName required");
    }
    const country = input.country.trim().toUpperCase();
    if (input.type === "BUSINESS" && country === "GR" && !input.vatNumber?.trim()) {
      throw new ValidationError("Greek BUSINESS billing profile requires AFM/VAT");
    }
    if (input.vatNumber && country === "GR") {
      assertGreekAfmFormat(input.vatNumber);
    }
    // INDIVIDUAL guests are never forced to have AFM.
    return new CustomerBillingProfile({
      ...input,
      country,
      legalName: input.legalName.trim(),
      vatNumber: input.vatNumber?.trim() || null,
      email: input.email?.trim() || null,
      address: normalizeAddress(input.address),
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: CustomerBillingProfileProps): CustomerBillingProfile {
    return new CustomerBillingProfile({
      ...props,
      address: { ...props.address },
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get type(): CustomerBillingType {
    return this.props.type;
  }
  get legalName(): string {
    return this.props.legalName;
  }
  get vatNumber(): string | null {
    return this.props.vatNumber;
  }
  get country(): string {
    return this.props.country;
  }
  get address(): FiscalAddress {
    return { ...this.props.address };
  }
  get email(): string | null {
    return this.props.email;
  }

  toProps(): CustomerBillingProfileProps {
    return {
      ...this.props,
      address: { ...this.props.address },
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  update(
    patch: Partial<
      Omit<CustomerBillingProfileProps, "id" | "tenantId" | "createdAt">
    >,
  ): void {
    if (patch.type !== undefined) this.props.type = patch.type;
    if (patch.legalName !== undefined) {
      if (!patch.legalName.trim()) throw new ValidationError("legalName required");
      this.props.legalName = patch.legalName.trim();
    }
    if (patch.country !== undefined) {
      this.props.country = patch.country.trim().toUpperCase();
    }
    if (patch.vatNumber !== undefined) {
      const v = patch.vatNumber?.trim() || null;
      if (v && (patch.country ?? this.props.country) === "GR") {
        assertGreekAfmFormat(v);
      }
      this.props.vatNumber = v;
    }
    if (patch.address !== undefined) {
      validateAddress(patch.address);
      this.props.address = normalizeAddress(patch.address);
    }
    if (patch.email !== undefined) {
      this.props.email = patch.email?.trim() || null;
    }
    const type = patch.type ?? this.props.type;
    const country = patch.country?.trim().toUpperCase() ?? this.props.country;
    if (type === "BUSINESS" && country === "GR" && !this.props.vatNumber) {
      throw new ValidationError("Greek BUSINESS billing profile requires AFM/VAT");
    }
    this.props.updatedAt = new Date();
  }
}

function validateAddress(address: FiscalAddress): void {
  if (!address.line1.trim() || !address.city.trim() || !address.postalCode.trim()) {
    throw new ValidationError("Incomplete fiscal address");
  }
  if (!/^[A-Z]{2}$/i.test(address.country.trim())) {
    throw new ValidationError("Invalid address country");
  }
}

function normalizeAddress(address: FiscalAddress): FiscalAddress {
  return {
    line1: address.line1.trim(),
    line2: address.line2?.trim() || null,
    city: address.city.trim(),
    region: address.region?.trim() || null,
    postalCode: address.postalCode.trim(),
    country: address.country.trim().toUpperCase(),
  };
}

/** Format check only — not an AFM checksum authority. */
export function assertGreekAfmFormat(afm: string): void {
  const digits = afm.trim();
  if (!/^\d{9}$/.test(digits)) {
    throw new ValidationError("Greek AFM/VAT must be exactly 9 digits");
  }
}
