import { Prisma } from "@prisma/client";
import { prisma, setTenantContext } from "../../client";
import {
  BusinessFiscalProfile,
  CustomerBillingProfile,
  TaxRule,
  greekStatutoryTaxRules,
  type TaxRuleScope,
  type TaxType,
  type CalculationKind,
  type TaxBasis,
  type ChargeCategory,
  type AccommodationType,
  type PropertyClassification,
  type CustomerBillingType,
} from "@hcp/domain";
import type {
  IBusinessFiscalProfileRepository,
  ICustomerBillingProfileRepository,
  ITaxRuleRepository,
} from "@hcp/domain";

function mapTaxRule(row: {
  id: string;
  tenantId: string | null;
  scope: TaxRuleScope;
  country: string;
  jurisdiction: string;
  taxType: TaxType;
  classificationKey: string;
  chargeCategory: string | null;
  accommodationType: string | null;
  propertyClassification: string | null;
  calculationKind: CalculationKind;
  ratePercent: Prisma.Decimal | null;
  fixedAmount: Prisma.Decimal | null;
  currency: string;
  basis: TaxBasis;
  validFrom: Date;
  validUntil: Date | null;
  seasonMonths: number[];
  floorAreaMinSqm: number | null;
  floorAreaMaxExclusiveSqm: number | null;
  legalSource: string | null;
  legalVersion: string | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}): TaxRule {
  return TaxRule.rehydrate({
    id: row.id,
    tenantId: row.tenantId,
    scope: row.scope,
    country: row.country,
    jurisdiction: row.jurisdiction,
    taxType: row.taxType,
    classificationKey: row.classificationKey,
    chargeCategory: row.chargeCategory as ChargeCategory | null,
    accommodationType: row.accommodationType as AccommodationType | null,
    propertyClassification:
      row.propertyClassification as PropertyClassification | null,
    calculationKind: row.calculationKind,
    ratePercent: row.ratePercent?.toFixed(4) ?? null,
    fixedAmount: row.fixedAmount?.toFixed(4) ?? null,
    currency: row.currency,
    basis: row.basis,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    season:
      row.seasonMonths.length > 0 ? { months: [...row.seasonMonths] } : null,
    floorAreaMinSqm: row.floorAreaMinSqm,
    floorAreaMaxExclusiveSqm: row.floorAreaMaxExclusiveSqm,
    legalSource: row.legalSource,
    legalVersion: row.legalVersion,
    priority: row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaTaxRuleRepository implements ITaxRuleRepository {
  /**
   * Platform statutory rules come from the versioned domain catalog
   * (greekStatutoryTaxRules). Tenant commercial overrides load from DB.
   * Tenant commercial never replaces platform statutory (resolveTaxRule).
   */
  async listForEvaluation(tenantId: string): Promise<TaxRule[]> {
    await setTenantContext(prisma, tenantId);
    const tenantRows = await prisma.taxRule.findMany({
      where: { tenantId, scope: "tenant_commercial" },
    });
    return [...greekStatutoryTaxRules(), ...tenantRows.map(mapTaxRule)];
  }

  async listPlatformStatutory(): Promise<TaxRule[]> {
    return greekStatutoryTaxRules();
  }
}

/** Upsert verified Greek statutory TaxRules (idempotent by id). */
export async function seedGreekStatutoryTaxRules(): Promise<number> {
  const rules = greekStatutoryTaxRules();
  let count = 0;
  for (const rule of rules) {
    const p = rule.toProps();
    await prisma.taxRule.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        tenantId: null,
        scope: p.scope,
        country: p.country,
        jurisdiction: p.jurisdiction,
        taxType: p.taxType,
        classificationKey: p.classificationKey,
        chargeCategory: p.chargeCategory,
        accommodationType: p.accommodationType,
        propertyClassification: p.propertyClassification,
        calculationKind: p.calculationKind,
        ratePercent: p.ratePercent ? new Prisma.Decimal(p.ratePercent) : null,
        fixedAmount: p.fixedAmount ? new Prisma.Decimal(p.fixedAmount) : null,
        currency: p.currency,
        basis: p.basis,
        validFrom: p.validFrom,
        validUntil: p.validUntil,
        seasonMonths: p.season?.months ?? [],
        floorAreaMinSqm: p.floorAreaMinSqm,
        floorAreaMaxExclusiveSqm: p.floorAreaMaxExclusiveSqm,
        legalSource: p.legalSource,
        legalVersion: p.legalVersion,
        priority: p.priority,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      },
      update: {
        ratePercent: p.ratePercent ? new Prisma.Decimal(p.ratePercent) : null,
        fixedAmount: p.fixedAmount ? new Prisma.Decimal(p.fixedAmount) : null,
        seasonMonths: p.season?.months ?? [],
        legalSource: p.legalSource,
        legalVersion: p.legalVersion,
        priority: p.priority,
        updatedAt: new Date(),
      },
    });
    count += 1;
  }
  return count;
}

function mapBusiness(row: {
  id: string;
  tenantId: string;
  propertyId: string;
  legalName: string;
  tradeName: string | null;
  country: string;
  vatNumber: string | null;
  addressLine1: string;
  addressLine2: string | null;
  addressCity: string;
  addressRegion: string | null;
  addressPostalCode: string;
  addressCountry: string;
  establishmentLocationId: string;
  establishmentInEligibleArea: boolean;
  servicePhysicallyExecutedInEligibleArea: boolean;
  fiscalJurisdiction: string;
  establishmentCode: string | null;
  accommodationType: string;
  propertyClassification: string | null;
  floorAreaSqm: number | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): BusinessFiscalProfile {
  return BusinessFiscalProfile.rehydrate({
    id: row.id,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    legalName: row.legalName,
    tradeName: row.tradeName,
    country: row.country,
    vatNumber: row.vatNumber,
    address: {
      line1: row.addressLine1,
      line2: row.addressLine2,
      city: row.addressCity,
      region: row.addressRegion,
      postalCode: row.addressPostalCode,
      country: row.addressCountry,
    },
    establishmentLocationId: row.establishmentLocationId,
    establishmentInEligibleArea: row.establishmentInEligibleArea,
    servicePhysicallyExecutedInEligibleArea:
      row.servicePhysicallyExecutedInEligibleArea,
    fiscalJurisdiction: row.fiscalJurisdiction,
    establishmentCode: row.establishmentCode,
    accommodationType: row.accommodationType as AccommodationType,
    propertyClassification:
      row.propertyClassification as PropertyClassification | null,
    floorAreaSqm: row.floorAreaSqm,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaBusinessFiscalProfileRepository
  implements IBusinessFiscalProfileRepository
{
  async save(profile: BusinessFiscalProfile): Promise<void> {
    const p = profile.toProps();
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, p.tenantId);
      await tx.businessFiscalProfile.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          tenantId: p.tenantId,
          propertyId: p.propertyId,
          legalName: p.legalName,
          tradeName: p.tradeName,
          country: p.country,
          vatNumber: p.vatNumber,
          addressLine1: p.address.line1,
          addressLine2: p.address.line2,
          addressCity: p.address.city,
          addressRegion: p.address.region,
          addressPostalCode: p.address.postalCode,
          addressCountry: p.address.country,
          establishmentLocationId: p.establishmentLocationId,
          establishmentInEligibleArea: p.establishmentInEligibleArea,
          servicePhysicallyExecutedInEligibleArea:
            p.servicePhysicallyExecutedInEligibleArea,
          fiscalJurisdiction: p.fiscalJurisdiction,
          establishmentCode: p.establishmentCode,
          accommodationType: p.accommodationType,
          propertyClassification: p.propertyClassification,
          floorAreaSqm: p.floorAreaSqm,
          metadata: p.metadata as Prisma.InputJsonValue,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        },
        update: {
          legalName: p.legalName,
          tradeName: p.tradeName,
          country: p.country,
          vatNumber: p.vatNumber,
          addressLine1: p.address.line1,
          addressLine2: p.address.line2,
          addressCity: p.address.city,
          addressRegion: p.address.region,
          addressPostalCode: p.address.postalCode,
          addressCountry: p.address.country,
          establishmentLocationId: p.establishmentLocationId,
          establishmentInEligibleArea: p.establishmentInEligibleArea,
          servicePhysicallyExecutedInEligibleArea:
            p.servicePhysicallyExecutedInEligibleArea,
          fiscalJurisdiction: p.fiscalJurisdiction,
          establishmentCode: p.establishmentCode,
          accommodationType: p.accommodationType,
          propertyClassification: p.propertyClassification,
          floorAreaSqm: p.floorAreaSqm,
          metadata: p.metadata as Prisma.InputJsonValue,
          updatedAt: p.updatedAt,
        },
      });
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<BusinessFiscalProfile | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.businessFiscalProfile.findFirst({
      where: { id, tenantId },
    });
    return row ? mapBusiness(row) : null;
  }

  async findByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<BusinessFiscalProfile | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.businessFiscalProfile.findFirst({
      where: { tenantId, propertyId },
    });
    return row ? mapBusiness(row) : null;
  }

  async listByTenant(tenantId: string): Promise<BusinessFiscalProfile[]> {
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.businessFiscalProfile.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapBusiness);
  }
}

function mapCustomer(row: {
  id: string;
  tenantId: string;
  type: CustomerBillingType;
  legalName: string;
  vatNumber: string | null;
  country: string;
  addressLine1: string;
  addressLine2: string | null;
  addressCity: string;
  addressRegion: string | null;
  addressPostalCode: string;
  addressCountry: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CustomerBillingProfile {
  return CustomerBillingProfile.rehydrate({
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    legalName: row.legalName,
    vatNumber: row.vatNumber,
    country: row.country,
    address: {
      line1: row.addressLine1,
      line2: row.addressLine2,
      city: row.addressCity,
      region: row.addressRegion,
      postalCode: row.addressPostalCode,
      country: row.addressCountry,
    },
    email: row.email,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaCustomerBillingProfileRepository
  implements ICustomerBillingProfileRepository
{
  async save(profile: CustomerBillingProfile): Promise<void> {
    const p = profile.toProps();
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, p.tenantId);
      await tx.customerBillingProfile.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          tenantId: p.tenantId,
          type: p.type,
          legalName: p.legalName,
          vatNumber: p.vatNumber,
          country: p.country,
          addressLine1: p.address.line1,
          addressLine2: p.address.line2,
          addressCity: p.address.city,
          addressRegion: p.address.region,
          addressPostalCode: p.address.postalCode,
          addressCountry: p.address.country,
          email: p.email,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        },
        update: {
          type: p.type,
          legalName: p.legalName,
          vatNumber: p.vatNumber,
          country: p.country,
          addressLine1: p.address.line1,
          addressLine2: p.address.line2,
          addressCity: p.address.city,
          addressRegion: p.address.region,
          addressPostalCode: p.address.postalCode,
          addressCountry: p.address.country,
          email: p.email,
          updatedAt: p.updatedAt,
        },
      });
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<CustomerBillingProfile | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.customerBillingProfile.findFirst({
      where: { id, tenantId },
    });
    return row ? mapCustomer(row) : null;
  }

  async listByTenant(tenantId: string): Promise<CustomerBillingProfile[]> {
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.customerBillingProfile.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapCustomer);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await setTenantContext(prisma, tenantId);
    await prisma.customerBillingProfile.deleteMany({ where: { id, tenantId } });
  }
}
