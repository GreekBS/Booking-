import type {
  MembershipStatus,
  PlatformRole,
  PropertyStatus,
  TenantRole,
} from "../../shared/types/index";
import type { Tenant } from "../domain/Tenant";

export interface PlatformPropertyRow {
  id: string;
  name: string;
  slug: string;
  status: PropertyStatus;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  city: string | null;
  region: string | null;
  country: string | null;
  unitCount: number;
  createdAt: Date;
}

export interface PlatformUserMembershipRow {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  status: MembershipStatus;
}

export interface PlatformUserRow {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole | null;
  emailVerified: Date | null;
  createdAt: Date;
  memberships: PlatformUserMembershipRow[];
}

export interface PlatformTenantMemberRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: TenantRole;
  status: MembershipStatus;
  platformRole: PlatformRole | null;
  createdAt: Date;
}

export interface PlatformTenantDetail {
  tenant: Tenant;
  propertyCount: number;
  memberCount: number;
  properties: PlatformPropertyRow[];
  members: PlatformTenantMemberRow[];
}

export interface ListPlatformPropertiesQuery {
  page: number;
  limit: number;
  /** Case-insensitive match on property name. */
  q?: string;
  tenantId?: string;
  /** Case-insensitive match on city. */
  city?: string;
  status?: PropertyStatus;
}

export interface ListPlatformUsersQuery {
  page: number;
  limit: number;
  /** Case-insensitive match on name or email. */
  q?: string;
  tenantId?: string;
  /** `super_admin` or `none` (null platform role). */
  platformRole?: "super_admin" | "none";
}

export interface PlatformDirectoryPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Cross-tenant Platform Admin directory reads.
 * Authorization is the caller's responsibility (requireSuperAdmin).
 */
export interface IPlatformDirectoryRepository {
  countProperties(): Promise<number>;
  countUsers(): Promise<number>;
  listProperties(
    query: ListPlatformPropertiesQuery,
  ): Promise<PlatformDirectoryPage<PlatformPropertyRow>>;
  listUsers(
    query: ListPlatformUsersQuery,
  ): Promise<PlatformDirectoryPage<PlatformUserRow>>;
  getTenantDetail(tenantId: string): Promise<PlatformTenantDetail | null>;
}
