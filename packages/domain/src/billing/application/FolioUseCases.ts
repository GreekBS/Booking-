import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IBookingRepository, IQuoteRepository } from "../../commerce/ports/CommercePorts";
import { Folio } from "../domain/Folio";
import type { FolioBalance, FolioLine } from "../domain/Folio";
import type { IFolioRepository, FolioWithLines } from "../ports/IFolioRepository";
import { projectQuoteSnapshotToFolioLines } from "./projectQuoteSnapshotToFolioLines";
import { assertCanAccessBookingProperty, assertCanOpenFolio } from "./billingAccess";

export interface FolioReadModel {
  id: string;
  tenantId: string;
  bookingId: string;
  folioKey: string;
  currency: string;
  status: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  lines: Array<{
    id: string;
    lineType: string;
    description: string;
    amount: string;
    currency: string;
    sourceType: string;
    sourceId: string;
    sourceLineRef: string | null;
    sortOrder: number;
    postedAt: string;
  }>;
  balance: FolioBalance;
}

function toReadModel(bundle: FolioWithLines): FolioReadModel {
  const { folio, lines } = bundle;
  // Ensure balance uses provided lines (rehydrated folio may already contain them)
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
      })),
    balance,
  };
}

export class OpenPrimaryFolioFromBookingUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly folioRepository: IFolioRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    actor: ActorContext,
  ): Promise<Result<FolioReadModel, Error>> {
    try {
      const booking = await this.bookingRepository.findById(bookingId, tenantId);
      if (!booking || booking.tenantId !== tenantId) {
        return Result.fail(new NotFoundError("Booking", bookingId));
      }

      if (
        !assertCanAccessBookingProperty(
          this.permissionChecker,
          actor,
          tenantId,
          booking.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError("Not allowed to open folio for this booking"));
      }

      try {
        assertCanOpenFolio(
          this.permissionChecker,
          actor,
          tenantId,
          booking.propertyId,
        );
      } catch (err) {
        return Result.fail(err instanceof Error ? err : new ForbiddenError("Not allowed"));
      }

      const existing = await this.folioRepository.findByBookingAndKey(
        tenantId,
        bookingId,
        Folio.primaryKey(),
      );
      if (existing) {
        return Result.ok(toReadModel(existing));
      }

      const quote = await this.quoteRepository.findById(booking.quoteId, tenantId);
      if (!quote || quote.tenantId !== tenantId) {
        return Result.fail(new ValidationError("Booking quote not found"));
      }

      if (quote.snapshotId !== booking.quoteSnapshotId) {
        // Still allow projection from current quote snapshot; provenance records quoteId + snapshotId.
      }

      const folio = Folio.open({
        id: this.idGenerator.generate(),
        tenantId,
        bookingId: booking.id,
        currency: quote.snapshot.currency,
        folioKey: Folio.primaryKey(),
        label: "Primary",
      });

      const projected = projectQuoteSnapshotToFolioLines({
        folio,
        quoteId: quote.id,
        snapshotId: quote.snapshotId,
        snapshot: quote.snapshot,
        idGenerator: this.idGenerator,
      });

      for (const line of projected) {
        folio.appendPostedLine(line);
      }

      const outcome = await this.folioRepository.saveNew(folio);
      if (outcome === "already_exists") {
        const raced = await this.folioRepository.findByBookingAndKey(
          tenantId,
          bookingId,
          Folio.primaryKey(),
        );
        if (!raced) {
          return Result.fail(new ValidationError("Folio race unresolved"));
        }
        return Result.ok(toReadModel(raced));
      }

      return Result.ok(
        toReadModel({
          folio,
          lines: folio.lines as FolioLine[],
        }),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListFoliosForBookingUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly folioRepository: IFolioRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    actor: ActorContext,
  ): Promise<Result<FolioReadModel[], Error>> {
    try {
      const booking = await this.bookingRepository.findById(bookingId, tenantId);
      if (!booking || booking.tenantId !== tenantId) {
        return Result.fail(new NotFoundError("Booking", bookingId));
      }

      if (
        !assertCanAccessBookingProperty(
          this.permissionChecker,
          actor,
          tenantId,
          booking.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError("Not allowed to read folios for this booking"));
      }

      const list = await this.folioRepository.findByBooking(tenantId, bookingId);
      return Result.ok(list.map(toReadModel));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetFolioUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly folioRepository: IFolioRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    folioId: string,
    actor: ActorContext,
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
        return Result.fail(new ForbiddenError("Not allowed to read this folio"));
      }

      return Result.ok(toReadModel(bundle));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Ensure BOOKING_UPDATE is available for open — re-export permission constant usage. */
export const BILLING_OPEN_REQUIRES = PERMISSIONS.BOOKING_UPDATE_TENANT;
