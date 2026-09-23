import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import {
  BusinessFiscalProfile,
  CustomerBillingProfile,
  type BusinessFiscalProfileProps,
  type CustomerBillingProfileProps,
} from "../domain/FiscalProfiles";
import type {
  IBusinessFiscalProfileRepository,
  ICustomerBillingProfileRepository,
} from "../ports/IFiscalProfileRepositories";

function assertTenantAdmin(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): void {
  const ok =
    permissionChecker.hasPermission(actor, PERMISSIONS.TENANT_UPDATE, tenantId) ||
    permissionChecker.hasPermission(actor, PERMISSIONS.PROPERTY_UPDATE_TENANT, tenantId) ||
    actor.isSuperAdmin ||
    actor.role === "super_admin";
  if (!ok) throw new ForbiddenError("Not allowed to manage fiscal profiles");
}

function assertTenantRead(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): void {
  const ok =
    permissionChecker.hasPermission(actor, PERMISSIONS.TENANT_READ, tenantId) ||
    permissionChecker.hasPermission(actor, PERMISSIONS.PROPERTY_READ_TENANT, tenantId) ||
    permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_TENANT, tenantId) ||
    actor.isSuperAdmin;
  if (!ok) throw new ForbiddenError("Not allowed to read fiscal profiles");
}

export class UpsertBusinessFiscalProfileUseCase {
  constructor(
    private readonly repository: IBusinessFiscalProfileRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    input: {
      propertyId: string;
      legalName: string;
      tradeName?: string | null;
      country: string;
      vatNumber?: string | null;
      address: BusinessFiscalProfileProps["address"];
      establishmentLocationId: string;
      establishmentInEligibleArea: boolean;
      servicePhysicallyExecutedInEligibleArea: boolean;
      establishmentCode?: string | null;
      accommodationType: BusinessFiscalProfileProps["accommodationType"];
      propertyClassification?: BusinessFiscalProfileProps["propertyClassification"];
      floorAreaSqm?: number | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<Result<BusinessFiscalProfileProps, Error>> {
    try {
      assertTenantAdmin(this.permissionChecker, actor, tenantId);
      const existing = await this.repository.findByProperty(
        tenantId,
        input.propertyId,
      );
      if (existing) {
        existing.update({
          legalName: input.legalName,
          tradeName: input.tradeName ?? null,
          country: input.country,
          vatNumber: input.vatNumber ?? null,
          address: input.address,
          establishmentLocationId: input.establishmentLocationId,
          establishmentInEligibleArea: input.establishmentInEligibleArea,
          servicePhysicallyExecutedInEligibleArea:
            input.servicePhysicallyExecutedInEligibleArea,
          establishmentCode: input.establishmentCode ?? null,
          accommodationType: input.accommodationType,
          propertyClassification: input.propertyClassification ?? null,
          floorAreaSqm: input.floorAreaSqm ?? null,
          metadata: input.metadata ?? {},
        });
        await this.repository.save(existing);
        return Result.ok(existing.toProps());
      }

      const profile = BusinessFiscalProfile.create({
        id: this.idGenerator.generate(),
        tenantId,
        propertyId: input.propertyId,
        legalName: input.legalName,
        tradeName: input.tradeName ?? null,
        country: input.country,
        vatNumber: input.vatNumber ?? null,
        address: input.address,
        establishmentLocationId: input.establishmentLocationId,
        establishmentInEligibleArea: input.establishmentInEligibleArea,
        servicePhysicallyExecutedInEligibleArea:
          input.servicePhysicallyExecutedInEligibleArea,
        establishmentCode: input.establishmentCode ?? null,
        accommodationType: input.accommodationType,
        propertyClassification: input.propertyClassification ?? null,
        floorAreaSqm: input.floorAreaSqm ?? null,
        metadata: input.metadata ?? {},
      });
      await this.repository.save(profile);
      return Result.ok(profile.toProps());
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListBusinessFiscalProfilesUseCase {
  constructor(
    private readonly repository: IBusinessFiscalProfileRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<BusinessFiscalProfileProps[], Error>> {
    try {
      assertTenantRead(this.permissionChecker, actor, tenantId);
      const list = await this.repository.listByTenant(tenantId);
      return Result.ok(list.map((p) => p.toProps()));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class UpsertCustomerBillingProfileUseCase {
  constructor(
    private readonly repository: ICustomerBillingProfileRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    input: {
      id?: string;
      type: CustomerBillingProfileProps["type"];
      legalName: string;
      vatNumber?: string | null;
      country: string;
      address: CustomerBillingProfileProps["address"];
      email?: string | null;
    },
  ): Promise<Result<CustomerBillingProfileProps, Error>> {
    try {
      assertTenantAdmin(this.permissionChecker, actor, tenantId);
      if (input.id) {
        const existing = await this.repository.findById(tenantId, input.id);
        if (!existing || existing.tenantId !== tenantId) {
          return Result.fail(new NotFoundError("CustomerBillingProfile", input.id));
        }
        existing.update({
          type: input.type,
          legalName: input.legalName,
          vatNumber: input.vatNumber ?? null,
          country: input.country,
          address: input.address,
          email: input.email ?? null,
        });
        await this.repository.save(existing);
        return Result.ok(existing.toProps());
      }

      const profile = CustomerBillingProfile.create({
        id: this.idGenerator.generate(),
        tenantId,
        type: input.type,
        legalName: input.legalName,
        vatNumber: input.vatNumber ?? null,
        country: input.country,
        address: input.address,
        email: input.email ?? null,
      });
      await this.repository.save(profile);
      return Result.ok(profile.toProps());
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListCustomerBillingProfilesUseCase {
  constructor(
    private readonly repository: ICustomerBillingProfileRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<CustomerBillingProfileProps[], Error>> {
    try {
      assertTenantRead(this.permissionChecker, actor, tenantId);
      const list = await this.repository.listByTenant(tenantId);
      return Result.ok(list.map((p) => p.toProps()));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetCustomerBillingProfileUseCase {
  constructor(
    private readonly repository: ICustomerBillingProfileRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<Result<CustomerBillingProfileProps, Error>> {
    try {
      assertTenantRead(this.permissionChecker, actor, tenantId);
      const profile = await this.repository.findById(tenantId, id);
      if (!profile || profile.tenantId !== tenantId) {
        return Result.fail(new NotFoundError("CustomerBillingProfile", id));
      }
      return Result.ok(profile.toProps());
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
