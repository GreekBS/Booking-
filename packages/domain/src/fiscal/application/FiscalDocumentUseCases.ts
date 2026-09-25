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
import type { IFolioRepository } from "../../billing/ports/IFolioRepository";
import type { FolioLine } from "../../billing/domain/Folio";
import { Money } from "../../commerce/shared/value-objects/Money";
import type { IBusinessFiscalProfileRepository } from "../ports/IFiscalProfileRepositories";
import type { ICustomerBillingProfileRepository } from "../ports/IFiscalProfileRepositories";
import {
  FiscalDocument,
  assertCreditWithinOriginal,
  type FiscalDocumentWithLines,
} from "../documents/FiscalDocument";
import { FiscalDocumentLine } from "../documents/FiscalDocumentLine";
import {
  FiscalLineAllocation,
  assertCanAllocate,
  computeFolioLineCoverage,
  type FolioLineFiscalCoverage,
} from "../documents/FiscalAllocation";
import type { FiscalDocumentKind } from "../documents/FiscalDocumentKinds";
import {
  assertSeriesKindCompatible,
  isClimateFeeDocumentKind,
  isCreditDocumentKind,
} from "../documents/FiscalDocumentKinds";
import type {
  FiscalCustomerSnapshot,
  FiscalIssuerSnapshot,
} from "../documents/FiscalPartySnapshots";
import { minimalB2cCustomerSnapshot } from "../documents/FiscalPartySnapshots";
import type {
  IFiscalAllocationRepository,
  IFiscalDocumentRepository,
  IFiscalSeriesRepository,
} from "../ports/IFiscalDocumentRepositories";
import { greekFiscalDocumentMapper } from "../mapping/GreekFiscalDocumentMapper";
import { assertCanOpenFolio } from "../../billing/application/billingAccess";
import type { IBookingRepository } from "../../commerce/ports/CommercePorts";

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
  if (!ok) throw new ForbiddenError("Not allowed to read fiscal documents");
}

export interface DraftLineSelection {
  folioLineId: string;
  /** Absolute amount to fiscalize from this FolioLine (4dp). */
  allocateAmount: string;
  description?: string;
}

function snapIssuer(
  profile: {
    id: string;
    propertyId: string;
    legalName: string;
    tradeName: string | null;
    country: string;
    vatNumber: string | null;
    address: FiscalIssuerSnapshot["address"];
    establishmentLocationId: string;
    establishmentCode: string | null;
    fiscalJurisdiction: string;
    accommodationType: string;
    propertyClassification: string | null;
    floorAreaSqm: number | null;
  },
  now: Date,
): FiscalIssuerSnapshot {
  return {
    businessFiscalProfileId: profile.id,
    propertyId: profile.propertyId,
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    country: profile.country,
    vatNumber: profile.vatNumber,
    address: { ...profile.address },
    establishmentLocationId: profile.establishmentLocationId,
    establishmentCode: profile.establishmentCode,
    fiscalJurisdiction: profile.fiscalJurisdiction,
    accommodationType: profile.accommodationType,
    propertyClassification: profile.propertyClassification,
    floorAreaSqm: profile.floorAreaSqm,
    snappedAt: now.toISOString(),
  };
}

function buildLineFromFolioLine(input: {
  id: string;
  tenantId: string;
  fiscalDocumentId: string;
  folioId: string;
  folioLine: FolioLine;
  allocateAmount: string;
  documentKind: FiscalDocumentKind;
  sortOrder: number;
  description?: string;
}): FiscalDocumentLine {
  const line = input.folioLine;
  const currency = line.currency;
  const allocate = Money.create(input.allocateAmount, currency);
  const taxSnap = line.taxSnapshot;

  if (isClimateFeeDocumentKind(input.documentKind)) {
    if (!taxSnap || taxSnap.taxType !== "climate_resilience_fee") {
      throw new ValidationError(
        "Climate Special Element requires climate_resilience_fee FolioLine snapshots",
      );
    }
    // Historical posted snapshot — never re-run TaxRules.
    const levy = allocate;
    const dailyUses = Array.isArray(taxSnap.metadata.dailyUses)
      ? taxSnap.metadata.dailyUses
      : taxSnap.metadata.dailyUses
        ? [taxSnap.metadata.dailyUses]
        : null;
    return FiscalDocumentLine.create({
      id: input.id,
      tenantId: input.tenantId,
      fiscalDocumentId: input.fiscalDocumentId,
      sortOrder: input.sortOrder,
      description:
        input.description?.trim() ||
        line.description ||
        "Climate Resilience Fee",
      quantity: "1.0000",
      unit: "daily_use",
      netAmount: "0.0000",
      vatAmount: "0.0000",
      levyAmount: levy.amount,
      grossAmount: levy.amount,
      currency,
      classificationKey: taxSnap.classificationKey,
      taxSnapshot: taxSnap,
      sourceFolioId: input.folioId,
      sourceFolioLineId: line.id,
      dailyUseProvenance: {
        totalDailyUses: taxSnap.metadata.totalDailyUses ?? null,
        complimentaryDailyUses: taxSnap.metadata.complimentaryDailyUses ?? null,
        taxableDailyUses: taxSnap.metadata.taxableDailyUses ?? null,
        dailyUses,
        ruleId: taxSnap.ruleId,
        ruleValidFrom: taxSnap.ruleValidFrom,
        ruleValidUntil: taxSnap.ruleValidUntil,
        legalSource: taxSnap.legalSource,
        legalVersion: taxSnap.legalVersion,
      },
      metadata: { fromTaxSnapshot: true },
    });
  }

  // VAT documents: treat FolioLine amount as NET for accommodation/extras unless
  // the line itself is a VAT tax line (then allocate as VAT only).
  if (line.lineType === "tax" && taxSnap?.taxType === "vat") {
    return FiscalDocumentLine.create({
      id: input.id,
      tenantId: input.tenantId,
      fiscalDocumentId: input.fiscalDocumentId,
      sortOrder: input.sortOrder,
      description: input.description?.trim() || line.description || "VAT",
      quantity: "1.0000",
      unit: null,
      netAmount: "0.0000",
      vatAmount: allocate.amount,
      levyAmount: "0.0000",
      grossAmount: allocate.amount,
      currency,
      classificationKey: taxSnap.classificationKey,
      taxSnapshot: taxSnap,
      sourceFolioId: input.folioId,
      sourceFolioLineId: line.id,
      dailyUseProvenance: null,
      metadata: {},
    });
  }

  if (line.lineType === "fee" && taxSnap?.taxType === "climate_resilience_fee") {
    throw new ValidationError(
      "Climate fee FolioLines must use CLIMATE_RESILIENCE_FEE_RECEIPT document kind",
    );
  }

  // Charge line as net; VAT should be selected as separate FolioLines when posting taxes.
  return FiscalDocumentLine.create({
    id: input.id,
    tenantId: input.tenantId,
    fiscalDocumentId: input.fiscalDocumentId,
    sortOrder: input.sortOrder,
    description: input.description?.trim() || line.description,
    quantity: "1.0000",
    unit: null,
    netAmount: allocate.amount,
    vatAmount: "0.0000",
    levyAmount: "0.0000",
    grossAmount: allocate.amount,
    currency,
    classificationKey: taxSnap?.classificationKey ?? line.lineType,
    taxSnapshot: taxSnap,
    sourceFolioId: input.folioId,
    sourceFolioLineId: line.id,
    dailyUseProvenance: null,
    metadata: {},
  });
}

export class CreateFiscalDocumentDraftUseCase {
  constructor(
    private readonly documentRepository: IFiscalDocumentRepository,
    private readonly seriesRepository: IFiscalSeriesRepository,
    private readonly allocationRepository: IFiscalAllocationRepository,
    private readonly folioRepository: IFolioRepository,
    private readonly bookingRepository: IBookingRepository,
    private readonly businessProfileRepository: IBusinessFiscalProfileRepository,
    private readonly customerProfileRepository: ICustomerBillingProfileRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLog: IAuditLogRepository,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    input: {
      folioId: string;
      seriesId: string;
      documentKind: FiscalDocumentKind;
      customerBillingProfileId?: string | null;
      retailCustomerName?: string | null;
      lineSelections: DraftLineSelection[];
      paymentMethodSummary?: string | null;
    },
    audit?: { actorId: string; ipAddress: string | null },
  ): Promise<
    Result<
      {
        document: ReturnType<FiscalDocument["toProps"]>;
        lines: ReturnType<FiscalDocumentLine["toProps"]>[];
        greekMapping: ReturnType<typeof greekFiscalDocumentMapper.map>;
      },
      Error
    >
  > {
    try {
      // Mapping fail-closed early
      const greekMapping = greekFiscalDocumentMapper.map(input.documentKind);

      const bundle = await this.folioRepository.findById(
        tenantId,
        input.folioId,
      );
      if (!bundle) throw new NotFoundError("Folio", input.folioId);

      const booking = await this.bookingRepository.findById(
        bundle.folio.bookingId,
        tenantId,
      );
      if (!booking) throw new NotFoundError("Booking", bundle.folio.bookingId);
      assertCanOpenFolio(
        this.permissionChecker,
        actor,
        tenantId,
        booking.propertyId,
      );

      const series = await this.seriesRepository.findById(
        tenantId,
        input.seriesId,
      );
      if (!series) throw new NotFoundError("FiscalSeries", input.seriesId);
      series.assertReadyToAllocate();
      assertSeriesKindCompatible(series.documentKind, input.documentKind);
      if (series.propertyId !== booking.propertyId) {
        throw new ValidationError(
          "FiscalSeries property does not match Folio booking property",
        );
      }

      const business = await this.businessProfileRepository.findByProperty(
        tenantId,
        booking.propertyId,
      );
      if (!business) {
        throw new ValidationError(
          "BusinessFiscalProfile required for property before drafting fiscal documents",
        );
      }
      business.assertReadyForTaxEvaluation();

      const now = new Date();
      const issuerSnapshot = snapIssuer(
        {
          id: business.id,
          propertyId: business.propertyId,
          legalName: business.legalName,
          tradeName: business.tradeName,
          country: business.country,
          vatNumber: business.vatNumber,
          address: business.address,
          establishmentLocationId: business.establishmentLocationId,
          establishmentCode: business.establishmentCode,
          fiscalJurisdiction: business.fiscalJurisdiction,
          accommodationType: business.accommodationType,
          propertyClassification: business.propertyClassification,
          floorAreaSqm: business.floorAreaSqm,
        },
        now,
      );

      let customerSnapshot: FiscalCustomerSnapshot | null = null;
      if (
        input.documentKind === "SERVICE_INVOICE" ||
        input.documentKind === "SERVICE_CREDIT"
      ) {
        if (!input.customerBillingProfileId) {
          throw new ValidationError(
            "B2B documents require customerBillingProfileId",
          );
        }
        const customer = await this.customerProfileRepository.findById(
          tenantId,
          input.customerBillingProfileId,
        );
        if (!customer) {
          throw new NotFoundError(
            "CustomerBillingProfile",
            input.customerBillingProfileId,
          );
        }
        if (customer.tenantId !== tenantId) {
          throw new ForbiddenError("Cross-tenant customer rejected");
        }
        customerSnapshot = {
          customerBillingProfileId: customer.id,
          type: customer.type,
          legalName: customer.legalName,
          vatNumber: customer.vatNumber,
          country: customer.country,
          address: customer.address,
          email: customer.email,
          snappedAt: now.toISOString(),
        };
      } else if (
        input.documentKind === "SERVICE_RECEIPT" ||
        input.documentKind === "RETAIL_CREDIT"
      ) {
        if (input.customerBillingProfileId) {
          const customer = await this.customerProfileRepository.findById(
            tenantId,
            input.customerBillingProfileId,
          );
          if (!customer) {
            throw new NotFoundError(
              "CustomerBillingProfile",
              input.customerBillingProfileId,
            );
          }
          customerSnapshot = {
            customerBillingProfileId: customer.id,
            type: customer.type,
            legalName: customer.legalName,
            vatNumber: customer.vatNumber,
            country: customer.country,
            address: customer.address,
            email: customer.email,
            snappedAt: now.toISOString(),
          };
        } else {
          customerSnapshot = minimalB2cCustomerSnapshot({
            legalName: input.retailCustomerName,
            country: business.country,
            now,
          });
        }
      } else if (isClimateFeeDocumentKind(input.documentKind)) {
        customerSnapshot = minimalB2cCustomerSnapshot({
          legalName: input.retailCustomerName ?? "Climate fee",
          country: business.country,
          now,
        });
      }

      if (!input.lineSelections.length) {
        throw new ValidationError("Select at least one FolioLine to fiscalize");
      }

      const lineById = new Map(bundle.lines.map((l) => [l.id, l]));
      const folioLineIds = input.lineSelections.map((s) => s.folioLineId);
      const existingAllocations =
        await this.allocationRepository.listByFolioLineIds(
          tenantId,
          folioLineIds,
        );

      const documentId = this.idGenerator.generate();
      const docLines: FiscalDocumentLine[] = [];
      let sort = 0;
      for (const sel of input.lineSelections) {
        const folioLine = lineById.get(sel.folioLineId);
        if (!folioLine) {
          throw new ValidationError(`Unknown FolioLine ${sel.folioLineId}`);
        }
        if (folioLine.tenantId !== tenantId) {
          throw new ForbiddenError("Cross-tenant FolioLine rejected");
        }
        const prior = existingAllocations
          .filter((a) => a.folioLineId === sel.folioLineId)
          .reduce(
            (m, a) => m.add(Money.create(a.allocatedAmount, a.currency)),
            Money.zero(folioLine.currency),
          );
        assertCanAllocate(
          folioLine.amount,
          folioLine.currency,
          prior.amount,
          sel.allocateAmount,
        );

        docLines.push(
          buildLineFromFolioLine({
            id: this.idGenerator.generate(),
            tenantId,
            fiscalDocumentId: documentId,
            folioId: input.folioId,
            folioLine,
            allocateAmount: sel.allocateAmount,
            documentKind: input.documentKind,
            sortOrder: sort++,
            description: sel.description,
          }),
        );
      }

      const { document, lines } = FiscalDocument.createDraft({
        id: documentId,
        tenantId,
        propertyId: booking.propertyId,
        documentKind: input.documentKind,
        seriesId: series.id,
        seriesCode: series.seriesCode,
        currency: bundle.folio.currency,
        issuerSnapshot,
        customerSnapshot,
        lines: docLines,
        paymentMethodSummary: input.paymentMethodSummary ?? null,
        sourceBookingId: booking.id,
        metadata: {
          folioId: input.folioId,
          localIssuanceOnly: true,
          pendingFiscalizationIntegration: true,
        },
        now,
      });

      await this.documentRepository.saveDraft(document, lines);

      if (audit) {
        await this.auditLog.append({
          tenantId,
          actorId: audit.actorId,
          action: "fiscal.document.draft",
          resourceType: "FiscalDocument",
          resourceId: document.id,
          metadata: {
            documentKind: input.documentKind,
            folioId: input.folioId,
            greekMapping: greekMapping.myDataInvoiceType,
          },
          ipAddress: audit.ipAddress,
        });
      }

      return Result.ok({
        document: document.toProps(),
        lines: lines.map((l) => l.toProps()),
        greekMapping,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class IssueFiscalDocumentUseCase {
  constructor(
    private readonly documentRepository: IFiscalDocumentRepository,
    private readonly seriesRepository: IFiscalSeriesRepository,
    private readonly allocationRepository: IFiscalAllocationRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    input: {
      documentId: string;
      issuanceIdempotencyKey: string;
    },
    audit: { actorId: string; ipAddress: string | null },
  ): Promise<
    Result<
      {
        document: ReturnType<FiscalDocument["toProps"]>;
        lines: ReturnType<FiscalDocumentLine["toProps"]>[];
        alreadyIssued: boolean;
        documentNumber: string | null;
      },
      Error
    >
  > {
    try {
      const existing = await this.documentRepository.findById(
        tenantId,
        input.documentId,
      );
      if (!existing) throw new NotFoundError("FiscalDocument", input.documentId);

      const canIssue =
        this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_UPDATE_TENANT,
          tenantId,
        ) ||
        this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.TENANT_UPDATE,
          tenantId,
        ) ||
        actor.isSuperAdmin;
      if (!canIssue) throw new ForbiddenError("Not allowed to issue fiscal documents");

      if (existing.document.status === "ISSUED") {
        if (
          existing.document.issuanceIdempotencyKey ===
          input.issuanceIdempotencyKey.trim()
        ) {
          return Result.ok({
            document: existing.document.toProps(),
            lines: existing.lines.map((l) => l.toProps()),
            alreadyIssued: true,
            documentNumber: existing.document.documentNumber(),
          });
        }
        throw new ValidationError("Document already issued");
      }
      existing.document.assertDraft();

      if (!existing.document.seriesId) {
        throw new ValidationError("Draft missing seriesId");
      }
      const series = await this.seriesRepository.findById(
        tenantId,
        existing.document.seriesId,
      );
      if (!series) throw new NotFoundError("FiscalSeries", existing.document.seriesId);
      series.assertReadyToAllocate();
      assertSeriesKindCompatible(
        series.documentKind,
        existing.document.documentKind,
      );

      // Re-check coverage against current allocations (advisory only — TX re-checks under FOR UPDATE).
      const folioLineIds = existing.lines
        .map((l) => l.sourceFolioLineId)
        .filter((id): id is string => !!id);
      const priorAlloc =
        await this.allocationRepository.listByFolioLineIds(
          tenantId,
          folioLineIds,
        );

      const allocations: FiscalLineAllocation[] = [];
      // Credits must not create FolioLine allocations (coverage stays with original).
      if (!isCreditDocumentKind(existing.document.documentKind)) {
        for (const line of existing.lines) {
          if (!line.sourceFolioLineId || !line.sourceFolioId) continue;
          const allocateAmount = isClimateFeeDocumentKind(
            existing.document.documentKind,
          )
            ? line.levyAmount
            : Money.create(line.netAmount, line.currency)
                .add(Money.create(line.vatAmount, line.currency))
                .add(Money.create(line.levyAmount, line.currency)).amount;

          const existingForLine = priorAlloc
            .filter((a) => a.folioLineId === line.sourceFolioLineId)
            .reduce(
              (m, a) => m.add(Money.create(a.allocatedAmount, a.currency)),
              Money.zero(line.currency),
            );
          // Soft pre-check; authoritative gate is inside issueAtomic under FOR UPDATE.
          void existingForLine;

          allocations.push(
            FiscalLineAllocation.create({
              id: this.idGenerator.generate(),
              tenantId,
              folioId: line.sourceFolioId,
              folioLineId: line.sourceFolioLineId,
              fiscalDocumentId: existing.document.id,
              fiscalDocumentLineId: line.id,
              allocatedAmount: allocateAmount,
              currency: line.currency,
              createdAt: new Date(),
            }),
          );
        }
      }

      // Domain markIssued happens inside repository after sequence allocation,
      // but we prepare the aggregate transition here then rehydrate — repository
      // applies sequence then persists. Clone draft and mark with placeholder
      // sequence that repository overwrites via issueAtomic internals.
      //
      // Actually: repository locks series, allocates N, then calls markIssued(N).
      // Pass draft + lines; repository performs markIssued after allocation.

      const draft = existing.document;
      const result = await this.documentRepository.issueAtomic({
        document: draft,
        lines: existing.lines,
        allocations,
        issuanceIdempotencyKey: input.issuanceIdempotencyKey,
        domainEvents: [], // filled after markIssued inside repo
        auditEntry: {
          tenantId,
          actorId: audit.actorId,
          action: "fiscal.document.issue",
          resourceType: "FiscalDocument",
          resourceId: draft.id,
          metadata: {
            documentKind: draft.documentKind,
            issuanceIdempotencyKey: input.issuanceIdempotencyKey,
          },
          ipAddress: audit.ipAddress,
        },
      });

      return Result.ok({
        document: result.document.toProps(),
        lines: result.lines.map((l) => l.toProps()),
        alreadyIssued: result.alreadyIssued,
        documentNumber: result.document.documentNumber(),
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetFiscalDocumentUseCase {
  constructor(
    private readonly documentRepository: IFiscalDocumentRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    documentId: string,
  ): Promise<
    Result<
      {
        document: ReturnType<FiscalDocument["toProps"]>;
        lines: ReturnType<FiscalDocumentLine["toProps"]>[];
        documentNumber: string | null;
        greekMapping: ReturnType<typeof greekFiscalDocumentMapper.map>;
        localStatusLabel: string;
      },
      Error
    >
  > {
    try {
      assertTenantRead(this.permissionChecker, actor, tenantId);
      const found = await this.documentRepository.findById(tenantId, documentId);
      if (!found) throw new NotFoundError("FiscalDocument", documentId);
      const propertyId = found.document.propertyId;
      if (
        !this.permissionChecker.canAccessProperty(
          actor,
          tenantId,
          propertyId,
          "property:read",
        )
      ) {
        return Result.fail(new ForbiddenError("Property access denied"));
      }
      if (
        actor.propertyIds !== null &&
        !actor.isSuperAdmin &&
        actor.role !== "admin" &&
        !actor.propertyIds.includes(propertyId)
      ) {
        return Result.fail(new ForbiddenError("Property access denied"));
      }
      const greekMapping = greekFiscalDocumentMapper.map(
        found.document.documentKind,
      );
      const localStatusLabel =
        found.document.status === "ISSUED"
          ? "Issued locally — pending fiscalization integration"
          : "Draft";
      return Result.ok({
        document: found.document.toProps(),
        lines: found.lines.map((l) => l.toProps()),
        documentNumber: found.document.documentNumber(),
        greekMapping,
        localStatusLabel,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListFiscalDocumentsUseCase {
  constructor(
    private readonly documentRepository: IFiscalDocumentRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    opts?: { propertyId?: string; limit?: number },
  ): Promise<
    Result<
      Array<{
        document: ReturnType<FiscalDocument["toProps"]>;
        documentNumber: string | null;
        localStatusLabel: string;
      }>,
      Error
    >
  > {
    try {
      assertTenantRead(this.permissionChecker, actor, tenantId);
      if (opts?.propertyId) {
        if (
          !this.permissionChecker.canAccessProperty(
            actor,
            tenantId,
            opts.propertyId,
            "property:read",
          )
        ) {
          return Result.fail(new ForbiddenError("Property access denied"));
        }
      }
      const rows = await this.documentRepository.listByTenant(tenantId, opts);
      return Result.ok(
        rows.map((d) => ({
          document: d.toProps(),
          documentNumber: d.documentNumber(),
          localStatusLabel:
            d.status === "ISSUED"
              ? "Issued locally"
              : d.status === "DRAFT"
                ? "Draft"
                : d.status,
        })),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetFolioFiscalCoverageUseCase {
  constructor(
    private readonly folioRepository: IFolioRepository,
    private readonly allocationRepository: IFiscalAllocationRepository,
    private readonly bookingRepository: IBookingRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    folioId: string,
  ): Promise<Result<{ coverage: FolioLineFiscalCoverage[] }, Error>> {
    try {
      const bundle = await this.folioRepository.findById(
        tenantId,
        folioId,
      );
      if (!bundle) throw new NotFoundError("Folio", folioId);
      const booking = await this.bookingRepository.findById(
        bundle.folio.bookingId,
        tenantId,
      );
      if (!booking) throw new NotFoundError("Booking", bundle.folio.bookingId);
      assertCanOpenFolio(
        this.permissionChecker,
        actor,
        tenantId,
        booking.propertyId,
      );

      const allocations = await this.allocationRepository.listByFolioId(
        tenantId,
        folioId,
      );
      const coverage = bundle.lines.map((line) =>
        computeFolioLineCoverage(
          line.id,
          line.amount,
          line.currency,
          allocations,
        ),
      );
      return Result.ok({ coverage });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class CreateCreditFiscalDocumentDraftUseCase {
  constructor(
    private readonly documentRepository: IFiscalDocumentRepository,
    private readonly seriesRepository: IFiscalSeriesRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLog: IAuditLogRepository,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    input: {
      originalDocumentId: string;
      seriesId: string;
      reason: string;
      /** When omitted, full gross credit. */
      creditGrossAmount?: string | null;
    },
    audit?: { actorId: string; ipAddress: string | null },
  ): Promise<
    Result<
      {
        document: ReturnType<FiscalDocument["toProps"]>;
        lines: ReturnType<FiscalDocumentLine["toProps"]>[];
      },
      Error
    >
  > {
    try {
      const can =
        this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_UPDATE_TENANT,
          tenantId,
        ) ||
        this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.TENANT_UPDATE,
          tenantId,
        ) ||
        actor.isSuperAdmin;
      if (!can) throw new ForbiddenError("Not allowed to create credit documents");

      const original = await this.documentRepository.findById(
        tenantId,
        input.originalDocumentId,
      );
      if (!original) {
        throw new NotFoundError("FiscalDocument", input.originalDocumentId);
      }
      if (original.document.tenantId !== tenantId) {
        throw new ForbiddenError("Cross-tenant original document rejected");
      }
      if (original.document.status !== "ISSUED") {
        throw new ValidationError("Can only credit an ISSUED document");
      }

      const creditKind: FiscalDocumentKind =
        original.document.documentKind === "SERVICE_INVOICE"
          ? "SERVICE_CREDIT"
          : original.document.documentKind === "SERVICE_RECEIPT"
            ? "RETAIL_CREDIT"
            : (() => {
                throw new ValidationError(
                  `Credits not supported for ${original.document.documentKind} in F3`,
                );
              })();

      greekFiscalDocumentMapper.map(creditKind);

      const series = await this.seriesRepository.findById(
        tenantId,
        input.seriesId,
      );
      if (!series) throw new NotFoundError("FiscalSeries", input.seriesId);
      series.assertReadyToAllocate();
      assertSeriesKindCompatible(series.documentKind, creditKind);
      if (series.propertyId !== original.document.propertyId) {
        throw new ValidationError("Credit series property mismatch");
      }

      const priorCredits = await this.documentRepository.listCreditsAgainst(
        tenantId,
        original.document.id,
      );
      const alreadyCredited = priorCredits
        .filter((c) => c.status === "ISSUED" || c.status === "DRAFT")
        .reduce(
          (m, c) =>
            m.add(Money.create(c.totals.grossTotal, c.currency)),
          Money.zero(original.document.currency),
        );

      const creditGross = input.creditGrossAmount
        ? Money.create(input.creditGrossAmount, original.document.currency)
        : Money.create(
            original.document.totals.grossTotal,
            original.document.currency,
          ).subtract(alreadyCredited);

      assertCreditWithinOriginal(
        original.document.totals.grossTotal,
        original.document.currency,
        alreadyCredited.amount,
        creditGross.amount,
      );

      const ratioNum = BigInt(creditGross.amount.replace(".", ""));
      const ratioDen = BigInt(
        original.document.totals.grossTotal.replace(".", ""),
      );

      const documentId = this.idGenerator.generate();
      const lines: FiscalDocumentLine[] = original.lines.map((ol, idx) => {
        const op = ol.toProps();
        const scale = (v: string) =>
          Money.create(v, op.currency)
            .multiplyByRatio(ratioNum, ratioDen).amount;
        // Credit lines are stored as positive magnitudes; kind indicates credit.
        return FiscalDocumentLine.create({
          id: this.idGenerator.generate(),
          tenantId,
          fiscalDocumentId: documentId,
          sortOrder: idx,
          description: `Credit: ${op.description}`,
          quantity: op.quantity,
          unit: op.unit,
          netAmount: scale(op.netAmount),
          vatAmount: scale(op.vatAmount),
          levyAmount: scale(op.levyAmount),
          grossAmount: scale(op.grossAmount),
          currency: op.currency,
          classificationKey: op.classificationKey,
          taxSnapshot: op.taxSnapshot,
          sourceFolioId: op.sourceFolioId,
          sourceFolioLineId: op.sourceFolioLineId,
          dailyUseProvenance: op.dailyUseProvenance,
          metadata: {
            creditOfDocumentLineId: op.id,
            creditOfDocumentId: original.document.id,
          },
        });
      });

      const issuer = original.document.issuerSnapshot;
      const customer = original.document.customerSnapshot;
      if (!issuer) throw new ValidationError("Original missing issuer snapshot");

      const { document, lines: frozen } = FiscalDocument.createDraft({
        id: documentId,
        tenantId,
        propertyId: original.document.propertyId,
        documentKind: creditKind,
        seriesId: series.id,
        seriesCode: series.seriesCode,
        currency: original.document.currency,
        issuerSnapshot: issuer,
        customerSnapshot: customer,
        lines,
        sourceBookingId: original.document.sourceBookingId,
        correlation: {
          originalDocumentId: original.document.id,
          reason: input.reason,
          creditedScope:
            creditGross.amount === original.document.totals.grossTotal &&
            alreadyCredited.isZero()
              ? "full"
              : "partial",
        },
        metadata: {
          localIssuanceOnly: true,
          pendingFiscalizationIntegration: true,
        },
      });

      await this.documentRepository.saveDraft(document, frozen);

      if (audit) {
        await this.auditLog.append({
          tenantId,
          actorId: audit.actorId,
          action: "fiscal.document.credit_draft",
          resourceType: "FiscalDocument",
          resourceId: document.id,
          metadata: {
            originalDocumentId: original.document.id,
            reason: input.reason,
            creditGross: creditGross.amount,
          },
          ipAddress: audit.ipAddress,
        });
      }

      return Result.ok({
        document: document.toProps(),
        lines: frozen.map((l) => l.toProps()),
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export type { FiscalDocumentWithLines };
