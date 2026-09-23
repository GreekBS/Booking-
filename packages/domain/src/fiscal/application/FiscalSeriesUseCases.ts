import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import { FiscalSeries } from "../documents/FiscalSeries";
import type { FiscalDocumentKind } from "../documents/FiscalDocumentKinds";
import { FISCAL_DOCUMENT_KINDS } from "../documents/FiscalDocumentKinds";
import type { IFiscalSeriesRepository } from "../ports/IFiscalDocumentRepositories";

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
  if (!ok) throw new ForbiddenError("Not allowed to manage fiscal series");
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
  if (!ok) throw new ForbiddenError("Not allowed to read fiscal series");
}

export class CreateFiscalSeriesUseCase {
  constructor(
    private readonly repository: IFiscalSeriesRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLog: IAuditLogRepository,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    input: {
      propertyId: string;
      documentKind: FiscalDocumentKind;
      seriesCode: string;
      label?: string | null;
      nextSequence?: number;
    },
    audit?: { actorId: string; ipAddress: string | null },
  ): Promise<Result<ReturnType<FiscalSeries["toProps"]>, Error>> {
    try {
      assertTenantAdmin(this.permissionChecker, actor, tenantId);
      if (!FISCAL_DOCUMENT_KINDS.includes(input.documentKind)) {
        throw new ValidationError(`Unsupported document kind: ${input.documentKind}`);
      }
      const series = FiscalSeries.create({
        id: this.idGenerator.generate(),
        tenantId,
        propertyId: input.propertyId,
        documentKind: input.documentKind,
        seriesCode: input.seriesCode,
        nextSequence: input.nextSequence ?? 1,
        active: true,
        label: input.label ?? null,
        metadata: {},
      });
      await this.repository.save(series);
      if (audit) {
        await this.auditLog.append({
          tenantId,
          actorId: audit.actorId,
          action: "fiscal.series.create",
          resourceType: "FiscalSeries",
          resourceId: series.id,
          metadata: {
            propertyId: input.propertyId,
            documentKind: input.documentKind,
            seriesCode: series.seriesCode,
          },
          ipAddress: audit.ipAddress,
        });
      }
      return Result.ok(series.toProps());
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListFiscalSeriesUseCase {
  constructor(
    private readonly repository: IFiscalSeriesRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<ReturnType<FiscalSeries["toProps"]>[], Error>> {
    try {
      assertTenantRead(this.permissionChecker, actor, tenantId);
      const rows = await this.repository.listByTenant(tenantId);
      return Result.ok(rows.map((s) => s.toProps()));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class SetFiscalSeriesActiveUseCase {
  constructor(
    private readonly repository: IFiscalSeriesRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLog: IAuditLogRepository,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    seriesId: string,
    active: boolean,
    audit?: { actorId: string; ipAddress: string | null },
  ): Promise<Result<ReturnType<FiscalSeries["toProps"]>, Error>> {
    try {
      assertTenantAdmin(this.permissionChecker, actor, tenantId);
      const series = await this.repository.findById(tenantId, seriesId);
      if (!series) throw new NotFoundError("FiscalSeries", seriesId);
      if (active) series.activate();
      else series.deactivate();
      await this.repository.save(series);
      if (audit) {
        await this.auditLog.append({
          tenantId,
          actorId: audit.actorId,
          action: active ? "fiscal.series.activate" : "fiscal.series.deactivate",
          resourceType: "FiscalSeries",
          resourceId: seriesId,
          metadata: {},
          ipAddress: audit.ipAddress,
        });
      }
      return Result.ok(series.toProps());
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
