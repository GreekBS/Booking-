import { Money } from "../../commerce/shared/value-objects/Money";
import { ValidationError } from "../../shared/errors/DomainError";

/**
 * Deterministic VAT NET ↔ GROSS helpers.
 * Uses Money bigint arithmetic only (4dp internal scale).
 *
 * Rounding: truncation toward zero via Money.multiplyByRatio integer division.
 * Greek/provider HALF_UP minor-unit policy is NOT locked here — finalized at F3
 * fiscal-document / certified-provider layer (see ADR-025).
 */

const SCALE = 4;
const SCALE_FACTOR = 10_000n;

function percentToScaled(percent: string): bigint {
  const trimmed = percent.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new ValidationError(`Invalid tax rate percent: ${percent}`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(".");
  const padded = `${fraction}${"0".repeat(SCALE)}`.slice(0, SCALE);
  const scaled = BigInt(whole ?? "0") * SCALE_FACTOR + BigInt(padded);
  return negative ? -scaled : scaled;
}

/**
 * Percent as 4dp string → ratio numerator/denominator for /100.
 * rate 13.0000 → scaled 130000; rate/100 = scaled / 1_000_000
 */
function rateRatio(percent: string): { rateScaled: bigint; hundredScaled: bigint } {
  return { rateScaled: percentToScaled(percent), hundredScaled: 100n * SCALE_FACTOR };
}

/** GROSS = NET × (100 + rate%) / 100 */
export function netToGross(net: Money, ratePercent: string): Money {
  if (net.isNegative()) {
    throw new ValidationError("NET amount must not be negative for VAT conversion");
  }
  const { rateScaled, hundredScaled } = rateRatio(ratePercent);
  return net.multiplyByRatio(hundredScaled + rateScaled, hundredScaled);
}

/** NET = GROSS × 100 / (100 + rate%) */
export function grossToNet(gross: Money, ratePercent: string): Money {
  if (gross.isNegative()) {
    throw new ValidationError("GROSS amount must not be negative for VAT conversion");
  }
  const { rateScaled, hundredScaled } = rateRatio(ratePercent);
  return gross.multiplyByRatio(hundredScaled, hundredScaled + rateScaled);
}

/** VAT portion of GROSS at given rate: GROSS − NET */
export function vatFromGross(gross: Money, ratePercent: string): Money {
  return gross.subtract(grossToNet(gross, ratePercent));
}

/** VAT portion of NET at given rate: GROSS − NET */
export function vatFromNet(net: Money, ratePercent: string): Money {
  return netToGross(net, ratePercent).subtract(net);
}
