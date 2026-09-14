import { ValueObject } from "../../../shared/kernel/ValueObject";
import { ValidationError } from "../../../shared/errors/DomainError";

const CURRENCY_REGEX = /^[A-Z]{3}$/;
const SCALE = 4;
const SCALE_FACTOR = 10_000n;

export interface MoneyProps {
  amount: string;
  currency: string;
}

function normalizeAmount(raw: string): string {
  const trimmed = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new ValidationError(`Invalid money amount: ${raw}`);
  }

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const parts = unsigned.split(".");
  const whole = parts[0] ?? "0";
  const fraction = parts[1] ?? "";
  const padded = `${fraction}${"0".repeat(SCALE)}`.slice(0, SCALE);
  return `${negative ? "-" : ""}${whole}.${padded}`;
}

function toScaledBigInt(amount: string): bigint {
  const normalized = normalizeAmount(amount);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const parts = unsigned.split(".");
  const whole = parts[0] ?? "0";
  const fraction = parts[1] ?? "0000";
  const scaled = BigInt(whole) * SCALE_FACTOR + BigInt(fraction);
  return negative ? -scaled : scaled;
}

function fromScaledBigInt(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE_FACTOR;
  const fraction = abs % SCALE_FACTOR;
  const fractionStr = fraction.toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole}.${fractionStr}`;
}

export class Money extends ValueObject<MoneyProps> {
  private constructor(props: MoneyProps) {
    super(props);
  }

  get amount(): string {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  static create(amount: string, currency: string): Money {
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!CURRENCY_REGEX.test(normalizedCurrency)) {
      throw new ValidationError(`Invalid currency code: ${currency}`);
    }

    return new Money({
      amount: normalizeAmount(amount),
      currency: normalizedCurrency,
    });
  }

  static zero(currency: string): Money {
    return Money.create("0.0000", currency);
  }

  add(other: Money): Money {
    assertSameCurrency(this, other);
    return Money.create(
      fromScaledBigInt(toScaledBigInt(this.amount) + toScaledBigInt(other.amount)),
      this.currency,
    );
  }

  subtract(other: Money): Money {
    assertSameCurrency(this, other);
    return Money.create(
      fromScaledBigInt(toScaledBigInt(this.amount) - toScaledBigInt(other.amount)),
      this.currency,
    );
  }

  applyPercent(percent: string): Money {
    const percentScaled = toScaledBigInt(normalizeAmount(percent));
    const amountScaled = toScaledBigInt(this.amount);
    const result = (amountScaled * percentScaled) / (100n * SCALE_FACTOR);
    return Money.create(fromScaledBigInt(result), this.currency);
  }

  applyPercentIncrease(percent: string): Money {
    const increase = this.applyPercent(percent);
    return this.add(increase);
  }

  applyPercentDecrease(percent: string): Money {
    const decrease = this.applyPercent(percent);
    return this.subtract(decrease);
  }

  multiplyByRatio(numerator: bigint, denominator: bigint): Money {
    if (denominator === 0n) {
      throw new ValidationError("Cannot divide money by zero");
    }
    const amountScaled = toScaledBigInt(this.amount);
    const result = (amountScaled * numerator) / denominator;
    return Money.create(fromScaledBigInt(result), this.currency);
  }

  isZero(): boolean {
    return toScaledBigInt(this.amount) === 0n;
  }

  isNegative(): boolean {
    return toScaledBigInt(this.amount) < 0n;
  }
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new ValidationError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
