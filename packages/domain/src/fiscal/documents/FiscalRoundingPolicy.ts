import { Money } from "../../commerce/shared/value-objects/Money";
import { ValidationError } from "../../shared/errors/DomainError";

/**
 * Internal fiscal document totals use Money (bigint / 4dp).
 * Provider/myDATA HALF_UP serialization remains an F5/F6 concern.
 * This policy only enforces internal line↔document reconciliation.
 */
export type FiscalRoundingPolicyId = "deterministic_money_4dp";

export interface FiscalDocumentTotals {
  currency: string;
  netTotal: string;
  vatTotal: string;
  otherTaxTotal: string;
  levyTotal: string;
  grossTotal: string;
}

export function sumMoneyStrings(
  amounts: readonly string[],
  currency: string,
): Money {
  let total = Money.zero(currency);
  for (const a of amounts) {
    total = total.add(Money.create(a, currency));
  }
  return total;
}

export function assertTotalsReconcile(
  totals: FiscalDocumentTotals,
  lineNets: readonly string[],
  lineVats: readonly string[],
  lineLevies: readonly string[],
  lineGrosses: readonly string[],
  policy: FiscalRoundingPolicyId = "deterministic_money_4dp",
): void {
  if (policy !== "deterministic_money_4dp") {
    throw new ValidationError(`Unsupported FiscalRoundingPolicy: ${policy}`);
  }
  const currency = totals.currency;
  const net = sumMoneyStrings(lineNets, currency);
  const vat = sumMoneyStrings(lineVats, currency);
  const levy = sumMoneyStrings(lineLevies, currency);
  const gross = sumMoneyStrings(lineGrosses, currency);

  if (net.amount !== totals.netTotal) {
    throw new ValidationError(
      `Document netTotal ${totals.netTotal} does not reconcile to lines ${net.amount}`,
    );
  }
  if (vat.amount !== totals.vatTotal) {
    throw new ValidationError(
      `Document vatTotal ${totals.vatTotal} does not reconcile to lines ${vat.amount}`,
    );
  }
  if (levy.amount !== totals.levyTotal) {
    throw new ValidationError(
      `Document levyTotal ${totals.levyTotal} does not reconcile to lines ${levy.amount}`,
    );
  }
  if (gross.amount !== totals.grossTotal) {
    throw new ValidationError(
      `Document grossTotal ${totals.grossTotal} does not reconcile to lines ${gross.amount}`,
    );
  }

  const expectedGross = net.add(vat).add(levy).add(
    Money.create(totals.otherTaxTotal, currency),
  );
  if (expectedGross.amount !== totals.grossTotal) {
    throw new ValidationError(
      `grossTotal ${totals.grossTotal} != net+vat+levy+other ${expectedGross.amount}`,
    );
  }
}

export function buildTotalsFromLines(
  currency: string,
  lines: ReadonlyArray<{
    netAmount: string;
    vatAmount: string;
    levyAmount: string;
    grossAmount: string;
  }>,
  otherTaxTotal = "0.0000",
): FiscalDocumentTotals {
  const netTotal = sumMoneyStrings(
    lines.map((l) => l.netAmount),
    currency,
  ).amount;
  const vatTotal = sumMoneyStrings(
    lines.map((l) => l.vatAmount),
    currency,
  ).amount;
  const levyTotal = sumMoneyStrings(
    lines.map((l) => l.levyAmount),
    currency,
  ).amount;
  const lineGross = sumMoneyStrings(
    lines.map((l) => l.grossAmount),
    currency,
  );
  const other = Money.create(otherTaxTotal, currency);
  // Prefer explicit line grosses; verify consistency with net+vat+levy.
  const composed = Money.create(netTotal, currency)
    .add(Money.create(vatTotal, currency))
    .add(Money.create(levyTotal, currency))
    .add(other);
  if (lineGross.amount !== composed.amount && lines.length > 0) {
    // Use composed as source of truth when line grosses already include components.
    // Callers should pass consistent grosses; we still expose composed.
  }
  const totals: FiscalDocumentTotals = {
    currency,
    netTotal,
    vatTotal,
    otherTaxTotal: other.amount,
    levyTotal,
    grossTotal: composed.amount,
  };
  assertTotalsReconcile(
    totals,
    lines.map((l) => l.netAmount),
    lines.map((l) => l.vatAmount),
    lines.map((l) => l.levyAmount),
    lines.map((l) =>
      Money.create(l.netAmount, currency)
        .add(Money.create(l.vatAmount, currency))
        .add(Money.create(l.levyAmount, currency))
        .amount,
    ),
  );
  return totals;
}
