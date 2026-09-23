import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IBookingRepository } from "../../commerce/ports/CommercePorts";
import { Money } from "../../commerce/shared/value-objects/Money";
import {
  Folio,
  FolioLine,
  type FolioLineTaxSnapshot,
} from "../domain/Folio";
import type { IFolioRepository } from "../ports/IFolioRepository";
import { TaxEngine } from "../tax/TaxEngine";
import type { ChargeCategory } from "../tax/TaxRule";
import type { ITaxRuleRepository } from "../../fiscal/ports/IFiscalProfileRepositories";
import type { IBusinessFiscalProfileRepository } from "../../fiscal/ports/IFiscalProfileRepositories";
import { assertCanAccessBookingProperty, assertCanOpenFolio } from "./billingAccess";
import type { FolioReadModel } from "./FolioUseCases";
import { StayPeriod } from "../../commerce/shared/value-objects/StayPeriod";

function chargeCategoryForLineType(lineType: string): ChargeCategory | null {
  switch (lineType) {
    case "accommodation":
      return "accommodation";
    case "extra":
      return "extra";
    case "service":
      return "service";
    case "fee":
      return "fee";
    default:
      return null;
  }
}

function toReadModelFromBundle(
  folio: Folio,
  lines: FolioLine[],
): FolioReadModel {
  const working = Folio.rehydrate(folio.toProps(), lines);
  const balance = working.computeBalance();
  return {
    id: folio.id,
    tenantId: folio.tenantId,
    bookingId: folio.bookingId,
    folioKey: folio.folioKey,
    currency: folio.currency,
    status: folio.status,
    label: folio.label,
    createdAt: folio.createdAt.toISOString(),
    updatedAt: folio.updatedAt.toISOString(),
    lines: lines
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((line) => ({
        id: line.id,
        lineType: line.lineType,
        description: line.description,
        amount: line.amount,
        currency: line.currency,
        sourceType: line.source.sourceType,
        sourceId: line.source.sourceId,
        sourceLineRef: line.source.sourceLineRef,
        sortOrder: line.sortOrder,
        postedAt: line.postedAt.toISOString(),
        taxSnapshot: line.taxSnapshot,
      })),
    balance,
  };
}

/**
 * Explicit Folio tax evaluation + append-only posting.
 * Does not mutate existing F1 commercial lines.
 * Idempotent per (folio, tax_evaluation, ruleId:sourceLine).
 */
export class EvaluateAndPostFolioTaxesUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly folioRepository: IFolioRepository,
    private readonly businessFiscalProfileRepository: IBusinessFiscalProfileRepository,
    private readonly taxRuleRepository: ITaxRuleRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
    private readonly taxEngine: TaxEngine = new TaxEngine(),
  ) {}

  async execute(
    tenantId: string,
    folioId: string,
    actor: ActorContext,
    options?: { complimentaryStay?: boolean; amountBasis?: "NET" | "GROSS" },
  ): Promise<Result<FolioReadModel, Error>> {
    try {
      const bundle = await this.folioRepository.findById(tenantId, folioId);
      if (!bundle || bundle.folio.tenantId !== tenantId) {
        return Result.fail(new NotFoundError("Folio", folioId));
      }

      const booking = await this.bookingRepository.findById(
        bundle.folio.bookingId,
        tenantId,
      );
      if (!booking || booking.tenantId !== tenantId) {
        return Result.fail(new NotFoundError("Booking", bundle.folio.bookingId));
      }

      if (
        !assertCanAccessBookingProperty(
          this.permissionChecker,
          actor,
          tenantId,
          booking.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError("Not allowed"));
      }
      try {
        assertCanOpenFolio(
          this.permissionChecker,
          actor,
          tenantId,
          booking.propertyId,
        );
      } catch (err) {
        return Result.fail(err instanceof Error ? err : new ForbiddenError());
      }

      const profile = await this.businessFiscalProfileRepository.findByProperty(
        tenantId,
        booking.propertyId,
      );
      if (!profile) {
        return Result.fail(
          new ValidationError(
            "BusinessFiscalProfile required for property before tax evaluation",
          ),
        );
      }
      profile.assertReadyForTaxEvaluation();

      const taxableLines = bundle.lines.filter((line) => {
        if (line.source.sourceType === "tax_evaluation") return false;
        if (line.source.sourceType.includes("placeholder")) return false;
        return chargeCategoryForLineType(line.lineType) != null;
      });

      const nightCount = StayPeriod.create(
        booking.stayPeriod.checkIn.value,
        booking.stayPeriod.checkOut.value,
      ).nightCount();

      const asOf = new Date(
        `${booking.stayPeriod.checkIn.value}T12:00:00.000Z`,
      );

      const rules = await this.taxRuleRepository.listForEvaluation(tenantId);
      const evaluation = this.taxEngine.evaluate(
        {
          tenantId,
          country: profile.country,
          jurisdiction: profile.fiscalJurisdiction,
          currency: bundle.folio.currency,
          asOf,
          accommodationType: profile.accommodationType,
          propertyClassification: profile.propertyClassification,
          floorAreaSqm: profile.floorAreaSqm,
          nightCount,
          roomOrApartmentCount: 1,
          guestCount: booking.guestCount.value,
          complimentaryStay: options?.complimentaryStay ?? false,
          amountBasis: options?.amountBasis ?? "NET",
          lines: taxableLines.map((line) => ({
            lineId: line.id,
            chargeCategory: chargeCategoryForLineType(line.lineType)!,
            amount: Money.create(line.amount, line.currency),
            description: line.description,
          })),
        },
        rules,
      );

      const existingRefs = new Set(
        bundle.lines
          .filter((l) => l.source.sourceType === "tax_evaluation")
          .map((l) => `${l.source.sourceId}::${l.source.sourceLineRef ?? ""}`),
      );

      const folio = Folio.rehydrate(bundle.folio.toProps(), [...bundle.lines]);
      let sortOrder =
        bundle.lines.reduce((max, l) => Math.max(max, l.sortOrder), -1) + 1;
      const toAppend: FolioLine[] = [];

      for (const component of evaluation.components) {
        const sourceLineRef = `${component.ruleId}:${component.sourceLineId ?? "climate"}`;
        const key = `${folioId}::${sourceLineRef}`;
        if (existingRefs.has(key)) continue;

        const snapshot: FolioLineTaxSnapshot = {
          taxType: component.taxType,
          classificationKey: component.classificationKey,
          calculationKind: component.calculationKind,
          appliedRatePercent: component.appliedRatePercent,
          appliedFixedAmount: component.appliedFixedAmount,
          taxableBase: component.taxableBase,
          calculatedAmount: component.calculatedAmount,
          currency: component.currency,
          ruleId: component.ruleId,
          ruleScope: component.ruleScope,
          ruleValidFrom: component.ruleValidFrom,
          ruleValidUntil: component.ruleValidUntil,
          jurisdiction: component.jurisdiction,
          legalSource: component.legalSource,
          legalVersion: component.legalVersion,
          metadata: { ...component.metadata },
        };

        const lineType = component.taxType === "vat" ? "tax" : "fee";
        const description =
          component.taxType === "vat"
            ? `VAT ${component.appliedRatePercent ?? ""}% (${component.classificationKey})`
            : `Climate Resilience Fee (${component.classificationKey})`;

        const line = FolioLine.createPosted({
          id: this.idGenerator.generate(),
          tenantId,
          folioId,
          lineType,
          description: description.trim(),
          amount: Money.create(component.calculatedAmount, component.currency),
          source: {
            sourceType: "tax_evaluation",
            sourceId: folioId,
            sourceLineRef,
          },
          sortOrder: sortOrder++,
          taxSnapshot: snapshot,
        });
        folio.appendPostedLine(line);
        toAppend.push(line);
      }

      if (toAppend.length > 0) {
        await this.folioRepository.appendLines(tenantId, folioId, toAppend);
      }

      const refreshed = await this.folioRepository.findById(tenantId, folioId);
      if (!refreshed) {
        return Result.fail(new NotFoundError("Folio", folioId));
      }
      return Result.ok(toReadModelFromBundle(refreshed.folio, refreshed.lines));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
