export type SortDirection = "asc" | "desc";

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total: items.length,
  };
}

export function sortBy<T>(items: T[], getter: (item: T) => string | number, direction: SortDirection) {
  return [...items].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return direction === "asc" ? cmp : -cmp;
  });
}

export function formatMoney(amount: string, currency: string) {
  const value = Number.parseFloat(amount);
  if (Number.isNaN(value)) return amount;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

export function nightsBetween(checkIn: string, checkOut: string) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONEY_FIELD_LABELS: Record<string, string> = {
  baseNightlyAmount: "Base nightly amount",
  nightlyAmount: "Season nightly amount",
  modifierValue: "Day-of-week modifier value",
  percentOff: "Length-of-stay discount percent",
};

/** Normalizes user input to rate-plan money format `\d+\.\d{4}` (e.g. "120" → "120.0000"). */
export function normalizeDecimalMoney(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const padded = `${fraction}${"0".repeat(4)}`.slice(0, 4);
  return `${whole}.${padded}`;
}

/** Strips trailing zeros for display (e.g. "120.0000" → "120", "120.5000" → "120.5"). */
export function formatDecimalMoneyForDisplay(amount: string): string {
  const normalized = normalizeDecimalMoney(amount);
  if (!normalized) return amount;
  const [whole = "0", fraction = ""] = normalized.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

export function moneyFieldLabel(path: string): string {
  const segment = path.split(".").pop() ?? path;
  return MONEY_FIELD_LABELS[segment] ?? path;
}

export function normalizeRatePlanForSubmit(plan: import("./types").RatePlanRecord): {
  payload: import("./types").RatePlanRecord;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const invalidMsg = "Enter a valid amount (e.g. 120 or 120.50).";

  const baseNightlyAmount = normalizeDecimalMoney(plan.baseNightlyAmount);
  if (!baseNightlyAmount) {
    errors.baseNightlyAmount = invalidMsg;
  }

  const seasons = plan.seasons.map((season, index) => {
    const nightlyAmount = normalizeDecimalMoney(season.nightlyAmount);
    if (!nightlyAmount) {
      errors[`seasons.${index}.nightlyAmount`] = invalidMsg;
    }
    return { ...season, nightlyAmount: nightlyAmount ?? season.nightlyAmount };
  });

  const dowModifiers = plan.dowModifiers.map((mod, index) => {
    const modifierValue = normalizeDecimalMoney(mod.modifierValue);
    if (!modifierValue) {
      errors[`dowModifiers.${index}.modifierValue`] = invalidMsg;
    }
    return { ...mod, modifierValue: modifierValue ?? mod.modifierValue };
  });

  const losDiscounts = plan.losDiscounts.map((disc, index) => {
    const percentOff = normalizeDecimalMoney(disc.percentOff);
    if (!percentOff) {
      errors[`losDiscounts.${index}.percentOff`] = invalidMsg;
    }
    return { ...disc, percentOff: percentOff ?? disc.percentOff };
  });

  return {
    payload: {
      ...plan,
      baseNightlyAmount: baseNightlyAmount ?? plan.baseNightlyAmount,
      seasons,
      dowModifiers,
      losDiscounts,
    },
    errors,
  };
}

export function formatRatePlanForDisplay(plan: import("./types").RatePlanRecord): import("./types").RatePlanRecord {
  return {
    ...plan,
    baseNightlyAmount: formatDecimalMoneyForDisplay(plan.baseNightlyAmount),
    seasons: plan.seasons.map((season) => ({
      ...season,
      nightlyAmount: formatDecimalMoneyForDisplay(season.nightlyAmount),
    })),
    dowModifiers: plan.dowModifiers.map((mod) => ({
      ...mod,
      modifierValue: formatDecimalMoneyForDisplay(mod.modifierValue),
    })),
    losDiscounts: plan.losDiscounts.map((disc) => ({
      ...disc,
      percentOff: formatDecimalMoneyForDisplay(disc.percentOff),
    })),
  };
}

export function parseApiValidationError(raw: string): { message: string; fields: string[] } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const fields: string[] = [];
      const messages = parsed.map((issue) => {
        if (!issue || typeof issue !== "object") return "One or more fields are invalid.";
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        if (path) fields.push(path);
        const code = "code" in issue ? String(issue.code) : "";
        if (code === "invalid_string" && path) {
          return `${moneyFieldLabel(path)} must use up to 4 decimal places (e.g. 120 or 120.50).`;
        }
        if (path) {
          return `${moneyFieldLabel(path)} is invalid.`;
        }
        return "One or more fields are invalid.";
      });
      return { message: messages.join(" "), fields };
    }
  } catch {
    // not JSON — fall through
  }

  if (raw.includes("invalid_string") && raw.includes("baseNightlyAmount")) {
    return {
      message: "Base nightly amount must use up to 4 decimal places (e.g. 120 or 120.50).",
      fields: ["baseNightlyAmount"],
    };
  }

  return { message: raw, fields: [] };
}
