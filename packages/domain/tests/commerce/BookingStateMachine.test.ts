import { describe, it, expect } from "vitest";
import { HoldStateMachine, BookingStateMachine } from "../../src/commerce/booking/domain/BookingStateMachine";
import { ConflictError, ValidationError } from "../../src/shared/errors/DomainError";
import type { BookingStatus, HoldStatus } from "../../src/commerce/shared/types/CommerceTypes";

describe("HoldStateMachine", () => {
  const valid: Array<[HoldStatus, HoldStatus]> = [
    ["active", "released"],
    ["active", "expired"],
    ["active", "converted"],
  ];

  it.each(valid)("allows %s -> %s", (from, to) => {
    expect(() => HoldStateMachine.assertCanTransition(from, to)).not.toThrow();
  });

  const invalid: Array<[HoldStatus, HoldStatus]> = [
    ["expired", "active"],
    ["released", "converted"],
    ["converted", "active"],
    ["expired", "released"],
  ];

  it.each(invalid)("rejects %s -> %s", (from, to) => {
    expect(() => HoldStateMachine.assertCanTransition(from, to)).toThrow(ConflictError);
  });

  it("assertActive rejects non-active holds", () => {
    expect(() => HoldStateMachine.assertActive("expired")).toThrow(ConflictError);
  });
});

describe("BookingStateMachine", () => {
  const valid: Array<[BookingStatus, BookingStatus]> = [
    ["pending", "confirmed"],
    ["pending", "cancelled"],
    ["pending", "payment_pending"],
    ["payment_pending", "confirmed"],
    ["payment_pending", "cancelled"],
    ["confirmed", "completed"],
    ["confirmed", "cancelled"],
  ];

  it.each(valid)("allows %s -> %s", (from, to) => {
    expect(() => BookingStateMachine.assertCanTransition(from, to)).not.toThrow();
  });

  const invalid: Array<[BookingStatus, BookingStatus]> = [
    ["cancelled", "confirmed"],
    ["completed", "confirmed"],
    ["completed", "cancelled"],
    ["payment_pending", "completed"],
    ["pending", "completed"],
  ];

  it.each(invalid)("rejects %s -> %s", (from, to) => {
    expect(() => BookingStateMachine.assertCanTransition(from, to)).toThrow(ConflictError);
  });

  it("sets initial status by confirmation mode", () => {
    expect(BookingStateMachine.initialStatus("manual")).toBe("pending");
    expect(BookingStateMachine.initialStatus("payment_required")).toBe("payment_pending");
  });

  it("assertCanConfirm respects confirmation mode", () => {
    expect(() =>
      BookingStateMachine.assertCanConfirm("pending", "manual"),
    ).not.toThrow();
    expect(() =>
      BookingStateMachine.assertCanConfirm("payment_pending", "payment_required"),
    ).not.toThrow();
    expect(() =>
      BookingStateMachine.assertCanConfirm("pending", "payment_required"),
    ).toThrow(ValidationError);
    expect(() =>
      BookingStateMachine.assertCanConfirm("payment_pending", "manual"),
    ).toThrow(ValidationError);
  });

  it("assertNotTerminal blocks cancelled and completed", () => {
    expect(() => BookingStateMachine.assertNotTerminal("cancelled")).toThrow(ConflictError);
    expect(() => BookingStateMachine.assertNotTerminal("completed")).toThrow(ConflictError);
  });
});
