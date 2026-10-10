import type { Property } from "../domain/Property";
import type { RoomType } from "../domain/RoomType";
import type {
  PaginatedResult,
  PaginationParams,
} from "../../shared/types/index";
import type { PropertyUnitCatalogResult } from "../types/PropertyUnitCatalog";

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
  /** Slim picker/filter catalog — no amenities/location/policies. */
  listUnitCatalog(
    tenantId: string,
    propertyIds?: string[] | null,
  ): Promise<PropertyUnitCatalogResult>;
  /**
   * Property-row FOR UPDATE → load → mutator → save in one tenant TX.
   * Used for atomic bulk unit creation and other inventory mutations.
   */
  mutateUnderLock(
    tenantId: string,
    propertyId: string,
    mutator: (property: Property) => void | Promise<void>,
  ): Promise<Property>;
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

export interface ListRoomTypesOptions {
  /** When true, include soft-deleted RoomTypes. Default: false. */
  includeDeleted?: boolean;
}

export interface IRoomTypeRepository {
  save(roomType: RoomType): Promise<void>;
  findById(
    tenantId: string,
    propertyId: string,
    roomTypeId: string,
  ): Promise<RoomType | null>;
  listByProperty(
    tenantId: string,
    propertyId: string,
    options?: ListRoomTypesOptions,
  ): Promise<RoomType[]>;
  /** Non-deleted Units currently linked to this RoomType. */
  countLinkedUnits(
    tenantId: string,
    propertyId: string,
    roomTypeId: string,
  ): Promise<number>;
}
