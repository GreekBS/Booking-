import type { Tenant } from "../domain/Tenant";
import type {
  PaginatedResult,
  PaginationParams,
} from "../../shared/types/index";

export interface ITenantRepository {
  save(tenant: Tenant): Promise<void>;
  findById(id: string): Promise<Tenant | null>;
  findBySlug(slug: string): Promise<Tenant | null>;
  existsBySlug(slug: string): Promise<boolean>;
  findAll(params: PaginationParams): Promise<PaginatedResult<Tenant>>;
  countProperties(tenantId: string): Promise<number>;
}
