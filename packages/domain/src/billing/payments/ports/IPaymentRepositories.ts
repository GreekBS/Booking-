import type { DomainEvent } from "../../../shared/kernel/DomainEvent";
import type { AuditEntry } from "../../../shared/types/index";
import type { Payment } from "../Payment";
import type { PaymentAllocation } from "../PaymentAllocation";
import type { PaymentAllocationReversal } from "../PaymentAllocationReversal";
import type { Refund } from "../Refund";
import type { SettlementAmountLine, SettlementRefundLine } from "../Settlement";

export interface IPaymentRepository {
  saveNew(payment: Payment): Promise<void>;
  findById(tenantId: string, id: string): Promise<Payment | null>;
  findByIdempotencyKey(tenantId: string, key: string): Promise<Payment | null>;
  listByTenant(
    tenantId: string,
    opts?: { limit?: number; bookingId?: string; propertyId?: string },
  ): Promise<Payment[]>;
  listByBooking(tenantId: string, bookingId: string): Promise<Payment[]>;
}

export interface PaymentSettlementView {
  payment: Payment;
  allocations: PaymentAllocation[];
  reversals: PaymentAllocationReversal[];
  refunds: Refund[];
  availability: {
    allocatedNet: string;
    refundedEffective: string;
    availableToAllocate: string;
    refundable: string;
    currency: string;
  };
}

export interface RecordPaymentAtomicCommand {
  payment: Payment;
  initialAllocations?: PaymentAllocation[];
  domainEvents: DomainEvent[];
  auditEntry: AuditEntry;
}

export interface AllocatePaymentAtomicCommand {
  allocation: PaymentAllocation;
  domainEvents: DomainEvent[];
  auditEntry: AuditEntry;
}

export interface ReverseAllocationAtomicCommand {
  reversal: PaymentAllocationReversal;
  domainEvents: DomainEvent[];
  auditEntry: AuditEntry;
}

export interface RefundAtomicCommand {
  refund: Refund;
  /** FIFO allocation reversals when refund exceeds unallocated balance. */
  fifoReversals?: PaymentAllocationReversal[];
  domainEvents: DomainEvent[];
  auditEntry: AuditEntry;
}

export interface FolioSettlementSums {
  allocationsToFolio: SettlementAmountLine[];
  reversalsForThoseAllocations: SettlementAmountLine[];
}

export interface IPaymentSettlementRepository {
  recordPaymentAtomic(command: RecordPaymentAtomicCommand): Promise<Payment>;
  allocateAtomic(command: AllocatePaymentAtomicCommand): Promise<PaymentAllocation>;
  reverseAllocationAtomic(
    command: ReverseAllocationAtomicCommand,
  ): Promise<PaymentAllocationReversal>;
  refundAtomic(command: RefundAtomicCommand): Promise<Refund>;
  getPaymentSettlementView(
    tenantId: string,
    paymentId: string,
  ): Promise<PaymentSettlementView | null>;
  getFolioSettlementAmounts(
    tenantId: string,
    folioId: string,
  ): Promise<FolioSettlementSums>;
}

export type { SettlementRefundLine };
