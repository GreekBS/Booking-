import { PERMISSIONS } from "@hcp/permissions";
import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { ActorContext, PermissionChecker } from "../../shared/services/PermissionChecker";
import type {
  IBookingRepository,
  ICommerceFlowRepository,
  IQuoteRepository,
  IRatePlanRepository,
} from "../ports/CommercePorts";
import { ReservationOrchestrator } from "../reservation/ReservationOrchestrator";
import type { StayChangePreview } from "../reservation/types";
import { assertCommercePropertyAccess } from "./commerceAccess";
import {
  BFS3_FINANCIAL_APPLY_GATE_MESSAGE,
  type IBookingFinancialConfirmTokenService,
} from "./BookingFinancialConfirmToken";
import {
  bookingProposedCommercialFingerprint,
  hashFinancialReason,
} from "../pricing/bookingFinancialFingerprint";

const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 500;

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
 * BFS-2 confirmation validation + hard apply gate.
 * Revalidates token against current booking/quote/RatePlan state inside a
 * tenant transaction, then always rejects mutation until BFS-3.
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
  ) {}

  async execute(
    command: ApplyBookingFinancialRepriceCommand,
    actor: ActorContext,
  ): Promise<Result<null, Error>> {
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

      const claims = this.confirmTokens.verify(command.confirmationToken);
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

      // Transaction-safe revalidation snapshot (no writes). BFS-3 will mutate here.
      return await this.commerceFlowRepository.runInTenantTransaction(
        command.tenantId,
        async () => {
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

          if (claims.propertyId !== booking.propertyId) {
            return Result.fail(
              new ValidationError(
                "Confirmation token does not match this property",
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

          // Hard gate: valid confirmation is NOT sufficient to mutate money in BFS-2.
          return Result.fail(
            new ValidationError(BFS3_FINANCIAL_APPLY_GATE_MESSAGE),
          );
        },
      );
    } catch (error) {
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
