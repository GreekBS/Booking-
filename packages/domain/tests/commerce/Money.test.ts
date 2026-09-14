import { describe, it, expect } from "vitest";
import { Money } from "../../src/commerce/shared/value-objects/Money";
import { ValidationError } from "../../src/shared/errors/DomainError";

describe("Money", () => {
  it("normalizes amounts to 4 decimal places", () => {
    expect(Money.create("100.5", "EUR").amount).toBe("100.5000");
    expect(Money.create("100", "eur").currency).toBe("EUR");
  });

  it("adds amounts without float drift", () => {
    const sum = Money.create("0.1000", "EUR").add(Money.create("0.2000", "EUR"));
    expect(sum.amount).toBe("0.3000");
  });

  it("subtracts amounts precisely", () => {
    const result = Money.create("10.0000", "EUR").subtract(Money.create("3.3333", "EUR"));
    expect(result.amount).toBe("6.6667");
  });

  it("applies percent with truncation toward zero", () => {
    const base = Money.create("99.9999", "EUR");
    expect(base.applyPercent("33.3333").amount).toBe("33.3332");
  });

  it("applies percent increase and decrease", () => {
    const base = Money.create("100.0000", "EUR");
    expect(base.applyPercentIncrease("20").amount).toBe("120.0000");
    expect(base.applyPercentDecrease("10").amount).toBe("90.0000");
  });

  it("multiplies by ratio", () => {
    const half = Money.create("100.0000", "EUR").multiplyByRatio(1n, 2n);
    expect(half.amount).toBe("50.0000");
  });

  it("rejects invalid currencies", () => {
    expect(() => Money.create("10.0000", "EURO")).toThrow(ValidationError);
    expect(() => Money.create("10.0000", "12")).toThrow(ValidationError);
    expect(() => Money.create("10.0000", "")).toThrow(ValidationError);
  });

  it("rejects invalid amounts", () => {
    expect(() => Money.create("abc", "EUR")).toThrow(ValidationError);
    expect(() => Money.create("10.000.0", "EUR")).toThrow(ValidationError);
  });

  it("rejects currency mismatch on arithmetic", () => {
    const eur = Money.create("10.0000", "EUR");
    const usd = Money.create("10.0000", "USD");
    expect(() => eur.add(usd)).toThrow(ValidationError);
  });

  it("detects zero and negative", () => {
    expect(Money.zero("EUR").isZero()).toBe(true);
    expect(Money.create("-1.0000", "EUR").isNegative()).toBe(true);
  });
});
