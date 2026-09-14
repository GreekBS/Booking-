export interface PublishableKeyRecord {
  id: string;
  tenantId: string;
  environment: "test" | "live";
  allowedDomains: string[];
}

export interface PublishableKeyListItem {
  id: string;
  keyPrefix: string;
  environment: "test" | "live";
  allowedDomains: string[];
  isActive: boolean;
  createdAt: Date;
}

export interface CreatePublishableKeyResult {
  id: string;
  publishableKey: string;
  environment: "test" | "live";
  allowedDomains: string[];
}

export interface IPublishableKeyRepository {
  findByKeyHash(keyHash: string): Promise<PublishableKeyRecord | null>;
  listByTenant(tenantId: string): Promise<PublishableKeyListItem[]>;
  create(params: {
    id: string;
    tenantId: string;
    rawKey: string;
    environment: "test" | "live";
    allowedDomains: string[];
  }): Promise<CreatePublishableKeyResult>;
  revoke(id: string, tenantId: string): Promise<void>;
  updateAllowedDomains(
    id: string,
    tenantId: string,
    allowedDomains: string[],
  ): Promise<PublishableKeyListItem>;
  findById(id: string, tenantId: string): Promise<PublishableKeyListItem | null>;
}

export interface PublicPropertyUnitReadModel {
  id: string;
  slug: string;
  name: string;
  maxGuests: number;
  bedrooms: number | null;
  bathrooms: number | null;
}

export interface PublicPropertyReadModel {
  id: string;
  slug: string;
  name: string;
  type: "villa" | "apartment" | "hotel" | "other";
  timezone: string;
  city: string | null;
  country: string | null;
  units: PublicPropertyUnitReadModel[];
}

export interface IStorefrontCatalogPort {
  getPublishedPropertyBySlug(
    tenantId: string,
    slug: string,
  ): Promise<PublicPropertyReadModel | null>;
  isPublishedUnit(tenantId: string, unitId: string): Promise<boolean>;
}

export interface IStorefrontIdempotencyRepository {
  findResourceId(
    tenantId: string,
    scope: "hold" | "booking",
    idempotencyKey: string,
  ): Promise<string | null>;
  save(
    tenantId: string,
    scope: "hold" | "booking",
    idempotencyKey: string,
    resourceId: string,
    expiresAt: Date,
  ): Promise<void>;
}
