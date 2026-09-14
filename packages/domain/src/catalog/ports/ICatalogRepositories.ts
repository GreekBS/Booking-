import type { Property } from "../domain/Property";
import type {
  PaginatedResult,
  PaginationParams,
} from "../../shared/types/index";

export interface IPropertyRepository {
  save(property: Property): Promise<void>;
  findById(tenantId: string, propertyId: string): Promise<Property | null>;
  findBySlug(tenantId: string, slug: string): Promise<Property | null>;
  existsBySlug(tenantId: string, slug: string): Promise<boolean>;
  findAll(
    tenantId: string,
    params: PaginationParams,
    propertyIds?: string[] | null,
  ): Promise<PaginatedResult<Property>>;
}

export interface AmenityRecord {
  id: string;
  tenantId: string | null;
  name: string;
  icon: string | null;
  category: string | null;
}

export interface IAmenityRepository {
  findAll(tenantId: string): Promise<AmenityRecord[]>;
  saveCustom(tenantId: string, name: string, icon?: string, category?: string): Promise<AmenityRecord>;
}
