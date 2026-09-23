import type {
  BusinessFiscalProfile,
  CustomerBillingProfile,
} from "../domain/FiscalProfiles";
import type { TaxRule } from "../../billing/tax/TaxRule";

export interface IBusinessFiscalProfileRepository {
  save(profile: BusinessFiscalProfile): Promise<void>;
  findById(tenantId: string, id: string): Promise<BusinessFiscalProfile | null>;
  findByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<BusinessFiscalProfile | null>;
  listByTenant(tenantId: string): Promise<BusinessFiscalProfile[]>;
}

export interface ICustomerBillingProfileRepository {
  save(profile: CustomerBillingProfile): Promise<void>;
  findById(tenantId: string, id: string): Promise<CustomerBillingProfile | null>;
  listByTenant(tenantId: string): Promise<CustomerBillingProfile[]>;
  delete(tenantId: string, id: string): Promise<void>;
}

export interface ITaxRuleRepository {
  /**
   * Platform statutory + tenant commercial rules visible to tenant.
   */
  listForEvaluation(tenantId: string): Promise<TaxRule[]>;
  listPlatformStatutory(): Promise<TaxRule[]>;
}
