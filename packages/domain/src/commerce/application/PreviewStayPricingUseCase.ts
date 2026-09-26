import { Result } from "../../shared/kernel/Result";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { PricingResult } from "../pricing/PricingCalculator";
import type { ICatalogQueryPort } from "../ports/CommercePorts";
import type { ReservationOrchestrator } from "../reservation/ReservationOrchestrator";
import {
  assertCommercePropertyAccess,
  resolveUnitContextForOperatorRead,
} from "./commerceAccess";

export interface PreviewStayPricingCommand {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  /** Informational only — pricing engine does not currently adjust by guest count. */
  guestCount?: number;
}

/**
 * Read-only stay pricing preview.
 * Uses StayPricingEngine / PricingCalculator via ReservationOrchestrator.
 * Does NOT create Hold, Quote, Booking, or calendar inventory.
 */
export class PreviewStayPricingUseCase {
  constructor(
    private readonly catalog: ICatalogQueryPort,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    command: PreviewStayPricingCommand,
    actor: ActorContext,
  ): Promise<Result<PricingResult, Error>> {
    try {
      const unitCtx = await resolveUnitContextForOperatorRead(
        this.catalog,
        command.unitId,
        command.tenantId,
      );
      if (unitCtx.isFailure) {
        return Result.fail(unitCtx.getError());
      }

      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        command.tenantId,
        unitCtx.getValue().property.id,
        PERMISSIONS.PRICING_READ_TENANT,
        PERMISSIONS.PRICING_READ_ASSIGNED,
      );

      return await this.orchestrator.priceStay(
        command.tenantId,
        command.unitId,
        command.checkIn,
        command.checkOut,
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
