import { PERMISSIONS } from "@hcp/permissions";
import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { ActorContext, PermissionChecker } from "../../shared/services/PermissionChecker";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type {
  IBookingRepository,
  ICommerceFlowRepository,
  IQuoteRepository,
  IRatePlanRepository,
} from "../ports/CommercePorts";
import type { IFolioRepository } from "../../billing/ports/IFolioRepository";
import type { IPaymentRepository } from "../../billing/payments/ports/IPaymentRepositories";
import type { IFiscalAllocationRepository } from "../../fiscal/ports/IFiscalDocumentRepositories";
import type { IBookingCommercialAmendmentRepository } from "../ports/IBookingCommercialAmendmentRepository";
import { FolioLine } from "../../billing/domain/Folio";
import {
  validateCommercialAmendmentFolioAdjustment,
  commercialAmendmentAdjustmentLineSpec,
} from "../../billing/application/commercialAmendmentFolioAdjustment";
import { ReservationOrchestrator } from "../reservation/ReservationOrchestrator";
import type { StayChangePreview } from "../reservation/types";
import { assertCommercePropertyAccess } from "./commerceAccess";
import {
  isBookingFinancialConfirmExpired,
  type IBookingFinancialConfirmTokenService,
} from "./BookingFinancialConfirmToken";
import {
  bookingProposedCommercialFingerprint,
  hashFinancialReason,
} from "../pricing/bookingFinancialFingerprint";
import {
  assertFinancialRepriceFolioGuards,
  assertFinancialRepriceQuoteGuards,
  COMMERCIAL_AMENDMENT_FOLIO_CONCURRENT_MESSAGE,
  COMMERCIAL_AMENDMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
  accommodationHasFiscalCoverage,
} from "../amendment/financialRepriceApplyGuards";
import {
  amendmentMatchesFinancialRepriceClaims,
  deriveFinancialRepriceConfirmationReference,
  deterministicFinancialRepriceLineId,
} from "../amendment/financialRepriceIdempotency";
import { BookingCommercialAmendment } from "../amendment/BookingCommercialAmendment";
import { mutationOriginOperator } from "../../shared/types/MutationOrigin";

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 500;

/**
 * Thrown inside the apply TX when another writer already persisted a matching
 * amendment. Aborts this TX (rolling back our quote write), then mapped to a
 * successful replayed Result by the outer catch.
 */
class FinancialRepriceConcurrentWinnerError extends Error {
  readonly amendment: BookingCommercialAmendment;
  constructor(amendment: BookingCommercialAmendment) {
    super("Financial reprice concurrent winner");
    this.name = "FinancialRepriceConcurrentWinnerError";
    this.amendment = amendment;
  }
}

export interface PreviewBookingFinancialRepriceCommand {
  tenantId: string;
  bookingId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  reason: string;
}

export interface PreviewBookingFinancialRepriceResult extends StayChangePreview {
  bookingId: string;
  currentQuoteId: string;
  reason: string;
  confirmationToken: string;
  confirmationExpiresAt: string;
}

export interface ApplyBookingFinancialRepriceCommand {
  tenantId: string;
  bookingId: string;
  confirmationToken: string;
  reason: string;
}

export interface ApplyBookingFinancialRepriceResult {
  bookingId: string;
  amendmentId: string;
  previousQuoteId: string;
  newQuoteId: string;
  previousTotalAmount: string;
  newTotalAmount: string;
  deltaAmount: string;
  currency: string;
  replayed: boolean;
}

/** Read + write deps for BFS-3b-2 atomic apply (still nested in one tenant TX). */
export interface FinancialRepriceApplySafetyPorts {
  folioRepository: IFolioRepository;
  paymentRepository: IPaymentRepository;
  fiscalAllocationRepository: IFiscalAllocationRepository;
  amendmentRepository: IBookingCommercialAmendmentRepository;
  auditLogRepository: IAuditLogRepository;
  idGenerator: IIdGenerator;
}

/**
 * BFS-2 read-only repricing preview + confirmation token issuance.
 * Never writes booking/quote/folio/payment rows.
 */
export class PreviewBookingFinancialRepriceUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly permissionChecker: PermissionChecker,
    private readonly confirmTokens: IBookingFinancialConfirmTokenService,
  ) {}

  async execute(
    command: PreviewBookingFinancialRepriceCommand,
    actor: ActorContext,
  ): Promise<Result<PreviewBookingFinancialRepriceResult, Error>> {
    try {
      const access = await this.assertFinancialAccess(command, actor);
      if (access.isFailure) return Result.fail(access.getError());

      const reason = normalizeReason(command.reason);
      if (reason.isFailure) return Result.fail(reason.getError());

      const booking = access.getValue();
      const currentQuote = await this.quoteRepository.findById(
        booking.quoteId,
        command.tenantId,
      );
      if (!currentQuote) {
        return Result.fail(new NotFoundError("Quote", booking.quoteId));
      }

      const preview = await this.orchestrator.previewStayChange(
        booking,
        {
          unitId: command.unitId,
          checkIn: command.checkIn,
          checkOut: command.checkOut,
          guestCount: command.guestCount,
          pricingIntent: "recalculate_from_rate_plan",
        },
        currentQuote,
        {
          source: "operator",
          pricingIntent: "recalculate_from_rate_plan",
        },
      );
      if (preview.isFailure) return Result.fail(preview.getError());

      const value = preview.getValue();
      if (!value.available || !value.proposed || !value.proposedCommercial) {
        return Result.fail(
          new ValidationError(
            value.reasons[0]?.message ??
              "Stay is not available for financial reprice preview",
          ),
        );
      }

      const commercial = value.proposedCommercial;
      try {
        assertFinancialRepriceQuoteGuards({
          pricingMode: currentQuote.snapshot.pricingMode,
          currentFeesAmount: currentQuote.snapshot.feesAmount,
          currentTaxesAmount: currentQuote.snapshot.taxesAmount,
          proposedFeesAmount: commercial.feesAmount,
          proposedTaxesAmount: commercial.taxesAmount,
          currency: currentQuote.snapshot.currency,
          currentTotalAmount: currentQuote.snapshot.totalAmount,
          proposedTotalAmount: commercial.totalAmount,
        });
      } catch (error) {
        return Result.fail(
          error instanceof Error ? error : new Error(String(error)),
        );
      }

      const { token, claims } = this.confirmTokens.issue({
        tenantId: command.tenantId,
        propertyId: booking.propertyId,
        bookingId: booking.id,
        actorId: actor.userId,
        pricingIntent: "recalculate_from_rate_plan",
        currentQuoteId: currentQuote.id,
        currentSnapshotId: currentQuote.snapshotId,
        currentTotalAmount: currentQuote.snapshot.totalAmount,
        currency: currentQuote.snapshot.currency,
        unitId: command.unitId,
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        guestCount: command.guestCount,
        proposedTotalAmount: commercial.totalAmount,
        proposedSubtotalAmount: commercial.subtotalAmount,
        proposedFeesAmount: commercial.feesAmount,
        proposedTaxesAmount: commercial.taxesAmount,
        proposedDiscountAmount: commercial.discountAmount,
        pricingFingerprint: commercial.pricingFingerprint,
        reasonHash: hashFinancialReason(reason.getValue()),
      });

      return Result.ok({
        ...value,
        bookingId: booking.id,
        currentQuoteId: currentQuote.id,
        reason: reason.getValue(),
        confirmationToken: token,
        confirmationExpiresAt: new Date(claims.exp * 1000).toISOString(),
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async assertFinancialAccess(
    command: PreviewBookingFinancialRepriceCommand,
    actor: ActorContext,
  ) {
    if (
      !this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.BOOKING_UPDATE_TENANT,
        command.tenantId,
      )
    ) {
      return Result.fail(new ForbiddenError());
    }
    if (
      !this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.BOOKING_FINANCIAL_ADJUST_TENANT,
        command.tenantId,
      )
    ) {
      return Result.fail(new ForbiddenError());
    }

    const booking = await this.bookingRepository.findById(
      command.bookingId,
      command.tenantId,
    );
    if (!booking) {
      return Result.fail(new NotFoundError("Booking", command.bookingId));
    }

    assertCommercePropertyAccess(
      this.permissionChecker,
      actor,
      command.tenantId,
      booking.propertyId,
      PERMISSIONS.BOOKING_UPDATE_TENANT,
      PERMISSIONS.BOOKING_READ_ASSIGNED,
    );

    return Result.ok(booking);
  }
}

/**
 * BFS-3b-2 atomic financial reprice apply.
 * Single tenant TX: folio→booking locks, revalidation, quote/booking/amendment/
 * folio adjustment/audit. Ordinary stay-change recalculate remains gated elsewhere.
 */
export class ApplyBookingFinancialRepriceUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly ratePlanRepository: IRatePlanRepository,
    private readonly commerceFlowRepository: ICommerceFlowRepository,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly permissionChecker: PermissionChecker,
    private readonly confirmTokens: IBookingFinancialConfirmTokenService,
    private readonly safety: FinancialRepriceApplySafetyPorts,
  ) {}

  async execute(
    command: ApplyBookingFinancialRepriceCommand,
    actor: ActorContext,
  ): Promise<Result<ApplyBookingFinancialRepriceResult, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_UPDATE_TENANT,
          command.tenantId,
        ) ||
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_FINANCIAL_ADJUST_TENANT,
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const reason = normalizeReason(command.reason);
      if (reason.isFailure) return Result.fail(reason.getError());

      // Cryptographic validity first — do not enforce exp yet so an already
      // committed amendment can still be replayed after wall-clock expiry.
      const claims = this.confirmTokens.verifySignature(
        command.confirmationToken,
      );
      if (!claims) {
        return Result.fail(
          new ValidationError("Confirmation token is invalid or expired"),
        );
      }

      if (
        claims.tenantId !== command.tenantId ||
        claims.bookingId !== command.bookingId
      ) {
        return Result.fail(
          new ValidationError("Confirmation token does not match this booking"),
        );
      }

      if (claims.actorId !== actor.userId) {
        return Result.fail(
          new ValidationError(
            "Confirmation token was issued for a different operator",
          ),
        );
      }

      if (claims.reasonHash !== hashFinancialReason(reason.getValue())) {
        return Result.fail(
          new ValidationError("Confirmation reason does not match preview"),
        );
      }

      const confirmationReference = deriveFinancialRepriceConfirmationReference(
        command.confirmationToken,
      );
      const idempotencyKey = confirmationReference;

      return await this.commerceFlowRepository.runInTenantTransaction(
        command.tenantId,
        async () => {
          // Lock order: folio (if any) → booking. Compatible with payment's
          // payment → folio → booking tail. If folio appears after a null lock,
          // fail closed rather than locking out of order.
          const lockedFolio =
            await this.safety.folioRepository.lockPrimaryForUpdate(
              command.tenantId,
              command.bookingId,
            );
          const lockedFolioId = lockedFolio?.folio.id ?? null;

          const lockedBookings = await this.bookingRepository.lockByIdsForUpdate(
            [command.bookingId],
            command.tenantId,
          );
          const booking = lockedBookings[0];
          if (!booking) {
            return Result.fail(new NotFoundError("Booking", command.bookingId));
          }

          assertCommercePropertyAccess(
            this.permissionChecker,
            actor,
            command.tenantId,
            booking.propertyId,
            PERMISSIONS.BOOKING_UPDATE_TENANT,
            PERMISSIONS.BOOKING_READ_ASSIGNED,
          );

          if (claims.propertyId !== booking.propertyId) {
            return Result.fail(
              new ValidationError(
                "Confirmation token does not match this property",
              ),
            );
          }

          // Replay-before-stale / replay-before-expiry: completed amendment
          // for this confirmation digest may be returned even when exp elapsed.
          const existing =
            await this.safety.amendmentRepository.findByIdempotencyKey(
              command.tenantId,
              idempotencyKey,
            );
          if (existing) {
            if (
              !amendmentMatchesFinancialRepriceClaims(existing, {
                claims,
                reason: reason.getValue(),
                confirmationReference,
                idempotencyKey,
              })
            ) {
              return Result.fail(
                new ValidationError(
                  COMMERCIAL_AMENDMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
                ),
              );
            }
            return Result.ok({
              bookingId: existing.bookingId,
              amendmentId: existing.id,
              previousQuoteId: existing.previousQuoteId,
              newQuoteId: existing.newQuoteId,
              previousTotalAmount: existing.previousTotalAmount,
              newTotalAmount: existing.newTotalAmount,
              deltaAmount: existing.deltaAmount,
              currency: existing.currency,
              replayed: true,
            });
          }

          // No committed amendment — expired tokens must not create new writes.
          if (isBookingFinancialConfirmExpired(claims)) {
            return Result.fail(
              new ValidationError("Confirmation token is invalid or expired"),
            );
          }

          // Identity recheck must NOT FOR UPDATE after booking lock — that would
          // invert payment's folio→booking order and risk deadlock. Plain read
          // under the ambient TX is enough to detect a concurrent primary folio.
          const recheckFolio =
            await this.safety.folioRepository.findByBookingAndKey(
              command.tenantId,
              command.bookingId,
              "primary",
            );
          if ((recheckFolio?.folio.id ?? null) !== lockedFolioId) {
            return Result.fail(
              new ValidationError(COMMERCIAL_AMENDMENT_FOLIO_CONCURRENT_MESSAGE),
            );
          }
          // Prefer the already-locked folio row/lines from step 1.
          const primaryFolio = lockedFolio?.folio ?? null;

          // Financial reprice mutates commercial totals only — never stay geometry.
          if (
            booking.unitId !== claims.unitId ||
            booking.stayPeriod.checkIn.value !== claims.checkIn ||
            booking.stayPeriod.checkOut.value !== claims.checkOut ||
            booking.guestCount.value !== claims.guestCount
          ) {
            return Result.fail(
              new ValidationError(
                "Confirmation is stale: booking stay geometry changed since preview",
              ),
            );
          }

          const currentQuote = await this.quoteRepository.findById(
            booking.quoteId,
            command.tenantId,
          );
          if (!currentQuote) {
            return Result.fail(new NotFoundError("Quote", booking.quoteId));
          }

          if (
            claims.currentQuoteId !== currentQuote.id ||
            claims.currentSnapshotId !== currentQuote.snapshotId ||
            claims.currentTotalAmount !== currentQuote.snapshot.totalAmount ||
            claims.currency !== currentQuote.snapshot.currency
          ) {
            return Result.fail(
              new ValidationError(
                "Confirmation is stale: booking quote or agreed total changed since preview",
              ),
            );
          }

          const preview = await this.orchestrator.previewStayChange(
            booking,
            {
              unitId: claims.unitId,
              checkIn: claims.checkIn,
              checkOut: claims.checkOut,
              guestCount: claims.guestCount,
              pricingIntent: "recalculate_from_rate_plan",
            },
            currentQuote,
            {
              source: "operator",
              pricingIntent: "recalculate_from_rate_plan",
            },
          );
          if (preview.isFailure) return Result.fail(preview.getError());

          const value = preview.getValue();
          if (!value.available || !value.proposedCommercial) {
            return Result.fail(
              new ValidationError(
                "Confirmation is stale: proposed stay is no longer available",
              ),
            );
          }

          const commercial = value.proposedCommercial;
          if (
            commercial.pricingFingerprint !== claims.pricingFingerprint ||
            commercial.totalAmount !== claims.proposedTotalAmount ||
            commercial.subtotalAmount !== claims.proposedSubtotalAmount ||
            commercial.feesAmount !== claims.proposedFeesAmount ||
            commercial.taxesAmount !== claims.proposedTaxesAmount ||
            commercial.discountAmount !== claims.proposedDiscountAmount
          ) {
            return Result.fail(
              new ValidationError(
                "Confirmation is stale: RatePlan or proposed pricing changed since preview",
              ),
            );
          }

          const ratePlan = await this.ratePlanRepository.findByUnitId(
            claims.unitId,
            command.tenantId,
          );
          if (!ratePlan) {
            return Result.fail(
              new ValidationError("Rate plan not configured for unit"),
            );
          }
          const liveFingerprint = bookingProposedCommercialFingerprint({
            ratePlan,
            unitId: claims.unitId,
            checkIn: claims.checkIn,
            checkOut: claims.checkOut,
            guestCount: claims.guestCount,
            subtotalAmount: commercial.subtotalAmount,
            feesAmount: commercial.feesAmount,
            taxesAmount: commercial.taxesAmount,
            discountAmount: commercial.discountAmount,
            totalAmount: commercial.totalAmount,
            currency: commercial.currency,
            lineItems: commercial.lineItems,
          });
          if (liveFingerprint !== claims.pricingFingerprint) {
            return Result.fail(
              new ValidationError(
                "Confirmation is stale: pricing fingerprint no longer matches",
              ),
            );
          }

          try {
            assertFinancialRepriceQuoteGuards({
              pricingMode: currentQuote.snapshot.pricingMode,
              currentFeesAmount: currentQuote.snapshot.feesAmount,
              currentTaxesAmount: currentQuote.snapshot.taxesAmount,
              proposedFeesAmount: commercial.feesAmount,
              proposedTaxesAmount: commercial.taxesAmount,
              currency: currentQuote.snapshot.currency,
              currentTotalAmount: currentQuote.snapshot.totalAmount,
              proposedTotalAmount: commercial.totalAmount,
            });

            const payments = await this.safety.paymentRepository.listByBooking(
              command.tenantId,
              command.bookingId,
            );
            const bookingFolios = await this.safety.folioRepository.findByBooking(
              command.tenantId,
              command.bookingId,
            );
            let fiscalAllocationCount = 0;
            for (const entry of bookingFolios) {
              const allocs =
                await this.safety.fiscalAllocationRepository.listByFolioId(
                  command.tenantId,
                  entry.folio.id,
                );
              fiscalAllocationCount += allocs.length;
            }
            const allocationsOnPrimary = primaryFolio
              ? await this.safety.fiscalAllocationRepository.listByFolioId(
                  command.tenantId,
                  primaryFolio.id,
                )
              : [];

            assertFinancialRepriceFolioGuards({
              primaryFolio,
              paymentCount: payments.length,
              fiscalAllocationCount,
              expectedAgreedTotal: currentQuote.snapshot.totalAmount,
              allocationsOnPrimary,
            });

            // Re-assert fiscal coverage under lock (allocations read after folio lock).
            if (
              primaryFolio &&
              accommodationHasFiscalCoverage(primaryFolio, allocationsOnPrimary)
            ) {
              throw new ValidationError(
                "Commercial amendment rejected: accommodation charges are fiscally allocated; credit-note workflow required",
              );
            }
          } catch (error) {
            return Result.fail(
              error instanceof Error ? error : new Error(String(error)),
            );
          }

          const commit = await this.orchestrator.commitAuthorizedFinancialReprice(
            booking,
            {
              unitId: claims.unitId,
              checkIn: claims.checkIn,
              checkOut: claims.checkOut,
              guestCount: claims.guestCount,
            },
            currentQuote,
            { mutationOrigin: mutationOriginOperator() },
          );
          if (commit.isFailure) return Result.fail(commit.getError());

          const { booking: updatedBooking, quote: newQuote } = commit.getValue();
          if (newQuote.snapshot.totalAmount !== claims.proposedTotalAmount) {
            return Result.fail(
              new ValidationError(
                "Confirmation is stale: committed total diverged from confirmed proposal",
              ),
            );
          }

          // Mutation phase: after the first write, failures MUST throw so the
          // ambient tenant TX rolls back. Returning Result.fail would commit.
          await this.commerceFlowRepository.saveStayChange(
            newQuote,
            updatedBooking,
          );

          const amendmentId = this.safety.idGenerator.generate();
          let amendment: BookingCommercialAmendment;
          try {
            amendment = BookingCommercialAmendment.create({
              id: amendmentId,
              tenantId: command.tenantId,
              propertyId: booking.propertyId,
              bookingId: booking.id,
              previousQuoteId: currentQuote.id,
              newQuoteId: newQuote.id,
              previousTotalAmount: currentQuote.snapshot.totalAmount,
              newTotalAmount: newQuote.snapshot.totalAmount,
              currency: currentQuote.snapshot.currency,
              pricingIntent: "recalculate_from_rate_plan",
              reason: reason.getValue(),
              actorId: actor.userId,
              mutationOrigin: "operator",
              confirmationReference,
              idempotencyKey,
              pricingFingerprint: claims.pricingFingerprint,
            });
          } catch (error) {
            throw error instanceof Error ? error : new Error(String(error));
          }

          const inserted = await this.safety.amendmentRepository.insert(amendment);
          if (inserted.status === "idempotent_conflict") {
            throw new ValidationError(
              COMMERCIAL_AMENDMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
            );
          }
          if (inserted.status === "idempotent_hit") {
            // Concurrent winner finished first — roll back our quote write and
            // return the durable winner via a controlled abort + re-read outside.
            // Throwing keeps this TX atomic; outer path re-reads for replay.
            throw new FinancialRepriceConcurrentWinnerError(inserted.amendment);
          }

          const persisted = inserted.amendment;

          if (primaryFolio) {
            const draft = validateCommercialAmendmentFolioAdjustment({
              folio: primaryFolio,
              deltaAmount: persisted.deltaAmount,
              amendmentId: persisted.id,
              hasFiscalCoverageOnAccommodation: false,
              description: `Commercial reprice ${persisted.id}`,
            });
            const lineSpec = commercialAmendmentAdjustmentLineSpec(
              draft,
              deterministicFinancialRepriceLineId(persisted.id),
            );
            const line = FolioLine.createPosted(lineSpec);
            primaryFolio.appendPostedLine(line);
            const appendResult = await this.safety.folioRepository.appendLines(
              command.tenantId,
              primaryFolio.id,
              [line],
            );
            if (appendResult === "conflict") {
              const again =
                await this.safety.amendmentRepository.findByIdempotencyKey(
                  command.tenantId,
                  idempotencyKey,
                );
              if (
                again &&
                amendmentMatchesFinancialRepriceClaims(again, {
                  claims,
                  reason: reason.getValue(),
                  confirmationReference,
                  idempotencyKey,
                })
              ) {
                throw new FinancialRepriceConcurrentWinnerError(again);
              }
              throw new ValidationError(
                "Financial reprice rejected: folio adjustment provenance conflict",
              );
            }
          }

          await this.safety.auditLogRepository.append({
            tenantId: command.tenantId,
            actorId: actor.userId,
            action: "booking.financial_reprice_applied",
            resourceType: "Booking",
            resourceId: booking.id,
            metadata: {
              bookingId: booking.id,
              propertyId: booking.propertyId,
              amendmentId: persisted.id,
              previousQuoteId: persisted.previousQuoteId,
              newQuoteId: persisted.newQuoteId,
              previousTotalAmount: persisted.previousTotalAmount,
              newTotalAmount: persisted.newTotalAmount,
              deltaAmount: persisted.deltaAmount,
              currency: persisted.currency,
              reason: persisted.reason,
              pricingFingerprint: persisted.pricingFingerprint,
              confirmationReference,
              appliedAt: new Date().toISOString(),
            },
            ipAddress: null,
          });

          return Result.ok({
            bookingId: booking.id,
            amendmentId: persisted.id,
            previousQuoteId: persisted.previousQuoteId,
            newQuoteId: persisted.newQuoteId,
            previousTotalAmount: persisted.previousTotalAmount,
            newTotalAmount: persisted.newTotalAmount,
            deltaAmount: persisted.deltaAmount,
            currency: persisted.currency,
            replayed: false,
          });
        },
      );
    } catch (error) {
      if (error instanceof FinancialRepriceConcurrentWinnerError) {
        const a = error.amendment;
        return Result.ok({
          bookingId: a.bookingId,
          amendmentId: a.id,
          previousQuoteId: a.previousQuoteId,
          newQuoteId: a.newQuoteId,
          previousTotalAmount: a.previousTotalAmount,
          newTotalAmount: a.newTotalAmount,
          deltaAmount: a.deltaAmount,
          currency: a.currency,
          replayed: true,
        });
      }
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function normalizeReason(raw: string): Result<string, Error> {
  const reason = raw?.trim() ?? "";
  if (reason.length < MIN_REASON_LENGTH) {
    return Result.fail(
      new ValidationError(
        `Financial change reason is required (min ${MIN_REASON_LENGTH} characters)`,
      ),
    );
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return Result.fail(
      new ValidationError(
        `Financial change reason must be at most ${MAX_REASON_LENGTH} characters`,
      ),
    );
  }
  return Result.ok(reason);
}
