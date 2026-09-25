import { Result } from "../../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IIdGenerator } from "../../../shared/ports/IIdGenerator";
import type { AuditEntry } from "../../../shared/types/index";
import type { IBookingRepository } from "../../../commerce/ports/CommercePorts";
import { Money } from "../../../commerce/shared/value-objects/Money";
import { Folio } from "../../domain/Folio";
import type { FolioBalance } from "../../domain/Folio";
import type { IFolioRepository } from "../../ports/IFolioRepository";
import { assertCanAccessBookingProperty } from "../../application/billingAccess";
import { Payment } from "../Payment";
import { PaymentAllocation } from "../PaymentAllocation";
import { PaymentAllocationReversal } from "../PaymentAllocationReversal";
import { Refund } from "../Refund";
import {
  assertCanAllocatePayment,
  assertCanRefund,
  assertCanReverse,
  computeFolioSettlement,
  computePaymentAvailability,
} from "../Settlement";
import { PaymentAllocated, PaymentAllocationReversed } from "../events/PaymentEvents";
import type {
  IPaymentRepository,
  IPaymentSettlementRepository,
} from "../ports/IPaymentRepositories";

export interface PaymentReadModel {
  id: string;
  tenantId: string;
  propertyId: string;
  currency: string;
  amount: string;
  status: string;
  method: string;
  collectionSource: string;
  externalReference: string | null;
  payerName: string | null;
  bookingId: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

function toPaymentReadModel(payment: Payment): PaymentReadModel {
  return {
    id: payment.id,
    tenantId: payment.tenantId,
    propertyId: payment.propertyId,
    currency: payment.currency,
    amount: payment.amount,
    status: payment.status,
    method: payment.method,
    collectionSource: payment.collectionSource,
    externalReference: payment.externalReference,
    payerName: payment.payerName,
    bookingId: payment.bookingId,
    idempotencyKey: payment.idempotencyKey,
    metadata: payment.metadata,
    receivedAt: payment.receivedAt.toISOString(),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

function assertCanMutatePayments(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): void {
  const ok =
    permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_UPDATE_TENANT, tenantId) ||
    permissionChecker.hasPermission(actor, PERMISSIONS.TENANT_UPDATE, tenantId) ||
    actor.isSuperAdmin;
  if (!ok) {
    throw new ForbiddenError("Not allowed to modify payments");
  }
}

function assertCanReadPayments(
  permissionChecker: PermissionChecker,
  actor: ActorContext,
  tenantId: string,
): void {
  const ok =
    permissionChecker.hasPermission(actor, PERMISSIONS.BOOKING_READ_TENANT, tenantId) ||
    permissionChecker.hasPermission(actor, PERMISSIONS.TENANT_UPDATE, tenantId) ||
    actor.isSuperAdmin;
  if (!ok) {
    throw new ForbiddenError("Not allowed to read payments");
  }
}

export class RecordManualPaymentUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly paymentRepository: IPaymentRepository,
    private readonly paymentSettlementRepository: IPaymentSettlementRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(input: {
    tenantId: string;
    actor: ActorContext;
    auditEntry: AuditEntry;
    currency: string;
    amount: string;
    method: import("../PaymentKinds").PaymentMethod;
    collectionSource: import("../PaymentKinds").CollectionSource;
    /** Canonical property ownership — required. */
    propertyId: string;
    bookingId?: string | null;
    payerName?: string | null;
    externalReference?: string | null;
    idempotencyKey: string;
    receivedAt?: Date;
    metadata?: Record<string, unknown>;
    initialFolioAllocations?: Array<{ folioId: string; amount: string; reason?: string | null }>;
  }): Promise<Result<PaymentReadModel, Error>> {
    try {
      assertCanMutatePayments(this.permissionChecker, input.actor, input.tenantId);

      const propertyId = input.propertyId.trim();
      if (!propertyId) {
        return Result.fail(new ValidationError("propertyId required"));
      }
      if (
        !this.permissionChecker.canAccessProperty(
          input.actor,
          input.tenantId,
          propertyId,
          "property:read",
        )
      ) {
        return Result.fail(new ForbiddenError("Property access denied"));
      }
      if (
        input.actor.propertyIds !== null &&
        !input.actor.isSuperAdmin &&
        input.actor.role !== "admin" &&
        !input.actor.propertyIds.includes(propertyId)
      ) {
        return Result.fail(new ForbiddenError("Property access denied"));
      }

      if (input.bookingId) {
        const booking = await this.bookingRepository.findById(input.bookingId, input.tenantId);
        if (!booking || booking.tenantId !== input.tenantId) {
          return Result.fail(new NotFoundError("Booking", input.bookingId));
        }
        if (booking.propertyId !== propertyId) {
          return Result.fail(
            new ValidationError("Payment propertyId must match Booking.propertyId"),
          );
        }
        if (
          !assertCanAccessBookingProperty(
            this.permissionChecker,
            input.actor,
            input.tenantId,
            booking.propertyId,
          )
        ) {
          return Result.fail(new ForbiddenError("Not allowed for this booking"));
        }
      }

      const dup = await this.paymentRepository.findByIdempotencyKey(
        input.tenantId,
        input.idempotencyKey,
      );
      if (dup) {
        const amount = Money.create(input.amount, input.currency).amount;
        const currency = input.currency.trim().toUpperCase();
        const bookingId = input.bookingId ?? null;
        if (
          dup.amount !== amount ||
          dup.currency !== currency ||
          dup.method !== input.method ||
          dup.collectionSource !== input.collectionSource ||
          dup.propertyId !== propertyId ||
          (dup.bookingId ?? null) !== bookingId
        ) {
          return Result.fail(
            new ValidationError("Conflicting idempotency key for payment"),
          );
        }
        return Result.ok(toPaymentReadModel(dup));
      }

      const succeededEventId = this.idGenerator.generate();
      const payment = Payment.create({
        id: this.idGenerator.generate(),
        tenantId: input.tenantId,
        propertyId,
        currency: input.currency,
        amount: Money.create(input.amount, input.currency),
        status: "SUCCEEDED",
        method: input.method,
        collectionSource: input.collectionSource,
        bookingId: input.bookingId ?? null,
        payerName: input.payerName,
        externalReference: input.externalReference,
        idempotencyKey: input.idempotencyKey,
        receivedAt: input.receivedAt,
        metadata: input.metadata,
        succeededEventDeliveryResourceId: succeededEventId,
      });

      const initialAllocations: PaymentAllocation[] = [];
      const extraEvents = [...payment.pullDomainEvents()];

      if (input.initialFolioAllocations?.length) {
        payment.assertSettleableForAllocation();
        let availability = computePaymentAvailability({
          amount: payment.amount,
          currency: payment.currency,
          allocations: [],
          reversals: [],
          refunds: [],
        });
        for (const slice of input.initialFolioAllocations) {
          assertCanAllocatePayment(
            availability.availableToAllocate,
            slice.amount,
            payment.currency,
          );
          const allocation = PaymentAllocation.create({
            id: this.idGenerator.generate(),
            tenantId: input.tenantId,
            paymentId: payment.id,
            folioId: slice.folioId,
            allocatedAmount: Money.create(slice.amount, payment.currency),
            paymentCurrency: payment.currency,
            createdByActorId: input.actor.userId,
            reason: slice.reason,
          });
          initialAllocations.push(allocation);
          extraEvents.push(
            new PaymentAllocated(allocation.id, input.tenantId, {
              paymentId: payment.id,
              folioId: slice.folioId,
              amount: slice.amount,
              currency: payment.currency,
              propertyId: payment.propertyId,
            }),
          );
          availability = computePaymentAvailability({
            amount: payment.amount,
            currency: payment.currency,
            allocations: initialAllocations.map((a) => ({
              amount: a.allocatedAmount,
              currency: a.currency,
            })),
            reversals: [],
            refunds: [],
          });
        }
      }

      const saved = await this.paymentSettlementRepository.recordPaymentAtomic({
        payment,
        initialAllocations: initialAllocations.length ? initialAllocations : undefined,
        domainEvents: extraEvents,
        auditEntry: input.auditEntry,
      });

      return Result.ok(toPaymentReadModel(saved));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetPaymentUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    paymentId: string,
    actor: ActorContext,
  ): Promise<Result<PaymentReadModel, Error>> {
    try {
      assertCanReadPayments(this.permissionChecker, actor, tenantId);
      const payment = await this.paymentRepository.findById(tenantId, paymentId);
      if (!payment || payment.tenantId !== tenantId) {
        return Result.fail(new NotFoundError("Payment", paymentId));
      }
      if (
        !this.permissionChecker.canAccessProperty(
          actor,
          tenantId,
          payment.propertyId,
          "property:read",
        )
      ) {
        return Result.fail(new ForbiddenError("Property access denied"));
      }
      return Result.ok(toPaymentReadModel(payment));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ListPaymentsUseCase {
  constructor(
    private readonly paymentRepository: IPaymentRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
    opts?: { bookingId?: string; propertyId?: string; limit?: number },
  ): Promise<Result<PaymentReadModel[], Error>> {
    try {
      assertCanReadPayments(this.permissionChecker, actor, tenantId);

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
        if (
          actor.propertyIds !== null &&
          !actor.isSuperAdmin &&
          actor.role !== "admin" &&
          !actor.propertyIds.includes(opts.propertyId)
        ) {
          return Result.fail(new ForbiddenError("Property access denied"));
        }
      }

      const list = opts?.bookingId
        ? await this.paymentRepository.listByBooking(tenantId, opts.bookingId)
        : await this.paymentRepository.listByTenant(tenantId, {
            limit: opts?.limit,
            bookingId: opts?.bookingId,
            propertyId: opts?.propertyId,
          });
      return Result.ok(list.map(toPaymentReadModel));
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class AllocatePaymentUseCase {
  constructor(
    private readonly folioRepository: IFolioRepository,
    private readonly bookingRepository: IBookingRepository,
    private readonly paymentSettlementRepository: IPaymentSettlementRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(input: {
    tenantId: string;
    paymentId: string;
    folioId: string;
    amount: string;
    actor: ActorContext;
    auditEntry: AuditEntry;
    reason?: string | null;
  }): Promise<Result<{ allocationId: string }, Error>> {
    try {
      assertCanMutatePayments(this.permissionChecker, input.actor, input.tenantId);

      const view = await this.paymentSettlementRepository.getPaymentSettlementView(
        input.tenantId,
        input.paymentId,
      );
      if (!view) {
        return Result.fail(new NotFoundError("Payment", input.paymentId));
      }

      if (
        !this.permissionChecker.canAccessProperty(
          input.actor,
          input.tenantId,
          view.payment.propertyId,
          "property:read",
        )
      ) {
        return Result.fail(new ForbiddenError("Property access denied"));
      }

      view.payment.assertSettleableForAllocation();

      const folioBundle = await this.folioRepository.findById(input.tenantId, input.folioId);
      if (!folioBundle || folioBundle.folio.tenantId !== input.tenantId) {
        return Result.fail(new NotFoundError("Folio", input.folioId));
      }
      if (folioBundle.folio.currency !== view.payment.currency) {
        return Result.fail(new ValidationError("Folio currency mismatch"));
      }

      const booking = await this.bookingRepository.findById(
        folioBundle.folio.bookingId,
        input.tenantId,
      );
      if (!booking || booking.tenantId !== input.tenantId) {
        return Result.fail(new NotFoundError("Booking", folioBundle.folio.bookingId));
      }
      if (booking.propertyId !== view.payment.propertyId) {
        return Result.fail(
          new ValidationError("Cannot allocate Payment across properties"),
        );
      }

      assertCanAllocatePayment(
        view.availability.availableToAllocate,
        input.amount,
        view.payment.currency,
      );

      const allocation = PaymentAllocation.create({
        id: this.idGenerator.generate(),
        tenantId: input.tenantId,
        paymentId: input.paymentId,
        folioId: input.folioId,
        allocatedAmount: Money.create(input.amount, view.payment.currency),
        paymentCurrency: view.payment.currency,
        createdByActorId: input.actor.userId,
        reason: input.reason,
      });

      const events = [
        new PaymentAllocated(allocation.id, input.tenantId, {
          paymentId: input.paymentId,
          folioId: input.folioId,
          amount: input.amount,
          currency: view.payment.currency,
          propertyId: view.payment.propertyId,
        }),
      ];

      await this.paymentSettlementRepository.allocateAtomic({
        allocation,
        domainEvents: events,
        auditEntry: input.auditEntry,
      });

      return Result.ok({ allocationId: allocation.id });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class ReversePaymentAllocationUseCase {
  constructor(
    private readonly paymentSettlementRepository: IPaymentSettlementRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(input: {
    tenantId: string;
    paymentId: string;
    allocationId: string;
    amount: string;
    reason: string;
    actor: ActorContext;
    auditEntry: AuditEntry;
  }): Promise<Result<{ reversalId: string }, Error>> {
    try {
      assertCanMutatePayments(this.permissionChecker, input.actor, input.tenantId);

      const view = await this.paymentSettlementRepository.getPaymentSettlementView(
        input.tenantId,
        input.paymentId,
      );
      if (!view) {
        return Result.fail(new NotFoundError("Payment", input.paymentId));
      }

      const allocation = view.allocations.find((a) => a.id === input.allocationId);
      if (!allocation) {
        return Result.fail(new NotFoundError("PaymentAllocation", input.allocationId));
      }

      const existingReversals = view.reversals
        .filter((r) => r.allocationId === input.allocationId)
        .map((r) => ({ amount: r.reversedAmount, currency: r.currency }));

      assertCanReverse(
        allocation.allocatedAmount,
        existingReversals,
        input.amount,
        allocation.currency,
      );

      const reversal = PaymentAllocationReversal.create({
        id: this.idGenerator.generate(),
        tenantId: input.tenantId,
        paymentId: input.paymentId,
        allocationId: input.allocationId,
        reversedAmount: Money.create(input.amount, allocation.currency),
        allocationCurrency: allocation.currency,
        reason: input.reason,
        createdByActorId: input.actor.userId,
      });

      const events = [
        new PaymentAllocationReversed(reversal.id, input.tenantId, {
          paymentId: input.paymentId,
          allocationId: input.allocationId,
          amount: input.amount,
          currency: allocation.currency,
        }),
      ];

      await this.paymentSettlementRepository.reverseAllocationAtomic({
        reversal,
        domainEvents: events,
        auditEntry: input.auditEntry,
      });

      return Result.ok({ reversalId: reversal.id });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class CreateRefundUseCase {
  constructor(
    private readonly paymentSettlementRepository: IPaymentSettlementRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(input: {
    tenantId: string;
    paymentId: string;
    amount: string;
    idempotencyKey: string;
    actor: ActorContext;
    auditEntry: AuditEntry;
    reason?: string | null;
    externalReference?: string | null;
  }): Promise<Result<{ refundId: string }, Error>> {
    try {
      assertCanMutatePayments(this.permissionChecker, input.actor, input.tenantId);

      const view = await this.paymentSettlementRepository.getPaymentSettlementView(
        input.tenantId,
        input.paymentId,
      );
      if (!view) {
        return Result.fail(new NotFoundError("Payment", input.paymentId));
      }

      view.payment.assertSettleableForRefund();
      assertCanRefund(view.availability.refundable, input.amount, view.payment.currency);

      const refund = Refund.create({
        id: this.idGenerator.generate(),
        tenantId: input.tenantId,
        paymentId: input.paymentId,
        amount: Money.create(input.amount, view.payment.currency),
        paymentCurrency: view.payment.currency,
        status: "SUCCEEDED",
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        externalReference: input.externalReference,
      });

      const refundAmount = Money.create(input.amount, view.payment.currency);
      const unallocated = Money.create(view.availability.availableToAllocate, view.payment.currency);
      let fifoReversals: PaymentAllocationReversal[] | undefined;
      const events = [...refund.pullDomainEvents()];

      if (toScaled(refundAmount.amount) > toScaled(unallocated.amount)) {
        const excess = refundAmount.subtract(unallocated);
        fifoReversals = buildFifoReversals({
          excess,
          allocations: view.allocations,
          reversals: view.reversals,
          tenantId: input.tenantId,
          paymentId: input.paymentId,
          actorId: input.actor.userId,
          reason: input.reason ?? "Refund allocation unwind",
          idGenerator: this.idGenerator,
          onReversal: (rev) => {
            events.push(
              new PaymentAllocationReversed(rev.id, input.tenantId, {
                paymentId: input.paymentId,
                allocationId: rev.allocationId,
                amount: rev.reversedAmount,
                currency: rev.currency,
              }),
            );
          },
        });
      }

      await this.paymentSettlementRepository.refundAtomic({
        refund,
        fifoReversals,
        domainEvents: events,
        auditEntry: input.auditEntry,
      });

      return Result.ok({ refundId: refund.id });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function buildFifoReversals(input: {
  excess: Money;
  allocations: PaymentAllocation[];
  reversals: PaymentAllocationReversal[];
  tenantId: string;
  paymentId: string;
  actorId: string;
  reason: string;
  idGenerator: IIdGenerator;
  onReversal: (rev: PaymentAllocationReversal) => void;
}): PaymentAllocationReversal[] {
  let remaining = input.excess;
  const sorted = input.allocations
    .slice()
    .sort((a, b) => a.toProps().createdAt.getTime() - b.toProps().createdAt.getTime());

  const out: PaymentAllocationReversal[] = [];
  for (const alloc of sorted) {
    if (toScaled(remaining.amount) <= 0n) break;
    const already = input.reversals
      .filter((r) => r.allocationId === alloc.id)
      .reduce(
        (m, r) => m.add(Money.create(r.reversedAmount, r.currency)),
        Money.zero(alloc.currency),
      );
    const allocMoney = Money.create(alloc.allocatedAmount, alloc.currency);
    const open = allocMoney.subtract(already);
    if (toScaled(open.amount) <= 0n) continue;

    const slice = toScaled(open.amount) <= toScaled(remaining.amount) ? open : remaining;
    const reversal = PaymentAllocationReversal.create({
      id: input.idGenerator.generate(),
      tenantId: input.tenantId,
      paymentId: input.paymentId,
      allocationId: alloc.id,
      reversedAmount: slice,
      allocationCurrency: alloc.currency,
      reason: input.reason,
      createdByActorId: input.actorId,
    });
    out.push(reversal);
    input.onReversal(reversal);
    remaining = remaining.subtract(slice);
  }

  if (toScaled(remaining.amount) > 0n) {
    throw new ValidationError("Insufficient allocated amount for refund FIFO unwind");
  }

  return out;
}

export class GetFolioSettlementUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly folioRepository: IFolioRepository,
    private readonly paymentSettlementRepository: IPaymentSettlementRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    folioId: string,
    actor: ActorContext,
  ): Promise<Result<{ balance: FolioBalance }, Error>> {
    try {
      assertCanReadPayments(this.permissionChecker, actor, tenantId);

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

      const working = Folio.rehydrate(bundle.folio.toProps(), bundle.lines);
      const lineBalance = working.computeBalance();
      const sums = await this.paymentSettlementRepository.getFolioSettlementAmounts(
        tenantId,
        folioId,
      );
      const settlement = computeFolioSettlement({
        folioTotal: lineBalance.folioTotal,
        currency: lineBalance.currency,
        allocationsToFolio: sums.allocationsToFolio,
        reversalsForThoseAllocations: sums.reversalsForThoseAllocations,
      });

      const balance = working.computeBalance({
        netSettledAmount: settlement.netSettledAmount,
        allocatedPaidAmount: settlement.allocatedPaidAmount,
        refundedAmount: settlement.refundedAmount,
        overpaymentAmount: settlement.overpaymentAmount,
        paidAmountSource: settlement.paidAmountSource,
      });

      return Result.ok({ balance });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function toScaled(amount: string): bigint {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const parts = unsigned.split(".");
  const w = parts[0] ?? "0";
  const f = (parts[1] ?? "0000").padEnd(4, "0").slice(0, 4);
  const scaled = BigInt(w) * 10_000n + BigInt(f);
  return negative ? -scaled : scaled;
}
