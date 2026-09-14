import type { BookingStatus, HoldStatus } from "../../shared/types/CommerceTypes";
import { ConflictError, ValidationError } from "../../../shared/errors/DomainError";

const HOLD_TRANSITIONS: Record<HoldStatus, HoldStatus[]> = {
  active: ["released", "expired", "converted"],
  released: [],
  expired: [],
  converted: [],
};

const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ["payment_pending", "confirmed", "cancelled"],
  payment_pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  cancelled: [],
  completed: [],
};

export class HoldStateMachine {
  static assertCanTransition(from: HoldStatus, to: HoldStatus): void {
    if (from === to) {
      return;
    }
    const allowed = HOLD_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new ConflictError(`Invalid hold transition: ${from} -> ${to}`);
    }
  }

  static assertActive(status: HoldStatus): void {
    if (status !== "active") {
      throw new ConflictError(`Hold is not active (status: ${status})`);
    }
  }
}

export class BookingStateMachine {
  static assertCanTransition(from: BookingStatus, to: BookingStatus): void {
    if (from === to) {
      return;
    }
    const allowed = BOOKING_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new ConflictError(`Invalid booking transition: ${from} -> ${to}`);
    }
  }

  static assertNotTerminal(status: BookingStatus): void {
    if (status === "cancelled" || status === "completed") {
      throw new ConflictError(`Booking is in terminal state: ${status}`);
    }
  }

  static initialStatus(confirmationMode: "manual" | "payment_required"): BookingStatus {
    return confirmationMode === "payment_required" ? "payment_pending" : "pending";
  }

  static assertCanConfirm(status: BookingStatus, confirmationMode: "manual" | "payment_required"): void {
    if (confirmationMode === "manual" && status === "pending") {
      return;
    }
    if (confirmationMode === "payment_required" && status === "payment_pending") {
      return;
    }
    throw new ValidationError(
      `Cannot confirm booking in status ${status} with mode ${confirmationMode}`,
    );
  }
}
