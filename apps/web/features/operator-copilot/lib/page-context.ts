/**
 * Operator Copilot page context (client side).
 *
 * Mirrors `CopilotPageContext` from `@hcp/domain`. These values are HINTS only:
 * the server re-authorizes every id before using it.
 */
export type CopilotPageContextKind =
  | "dashboard"
  | "calendar"
  | "booking"
  | "messages"
  | "housekeeping"
  | "generic";

export interface CopilotPageContext {
  kind: CopilotPageContextKind;
  propertyId?: string;
  bookingId?: string;
  conversationId?: string;
  unitId?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Hints a page may publish (everything except the route-derived `kind`). */
export type CopilotPageContextHints = Partial<Omit<CopilotPageContext, "kind">> & {
  kind?: CopilotPageContextKind;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const KINDS: readonly CopilotPageContextKind[] = [
  "dashboard",
  "calendar",
  "booking",
  "messages",
  "housekeeping",
  "generic",
];

function kindFromPathname(pathname: string): CopilotPageContextKind {
  const path = pathname.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (path === "/dashboard") return "dashboard";
  if (path.startsWith("/dashboard/availability")) return "calendar";
  if (path.startsWith("/dashboard/bookings")) return "booking";
  if (path.startsWith("/dashboard/messages")) return "messages";
  if (path.startsWith("/dashboard/housekeeping")) return "housekeeping";
  return "generic";
}

function bookingIdFromPathname(pathname: string): string | undefined {
  const match = /^\/dashboard\/bookings\/([^/?#]+)/.exec(pathname);
  const segment = match?.[1];
  return segment && UUID_RE.test(segment) ? segment.toLowerCase() : undefined;
}

/**
 * Derive the Copilot page context from the current route plus optional
 * page-published hints. Invalid hint values are dropped (never forwarded).
 */
export function derivePageContext(
  pathname: string | null | undefined,
  hints?: CopilotPageContextHints | null,
): CopilotPageContext {
  const path = pathname ?? "";
  const context: CopilotPageContext = { kind: kindFromPathname(path) };

  const routeBookingId = bookingIdFromPathname(path);
  if (routeBookingId) context.bookingId = routeBookingId;

  if (!hints) return context;

  if (hints.kind && KINDS.includes(hints.kind)) context.kind = hints.kind;

  const uuidFields = ["propertyId", "bookingId", "conversationId", "unitId"] as const;
  for (const field of uuidFields) {
    const value = hints[field];
    if (typeof value === "string" && UUID_RE.test(value)) {
      context[field] = value.toLowerCase();
    }
  }
  const dateFields = ["dateFrom", "dateTo"] as const;
  for (const field of dateFields) {
    const value = hints[field];
    if (typeof value === "string" && ISO_DATE_RE.test(value)) {
      context[field] = value;
    }
  }
  return context;
}
