/**
 * DTO minimizers for Operator Copilot tool results.
 *
 * Everything the model sees passes through here. Rules:
 * - No email, phone, payment, credential or full-name data.
 * - Guest-authored text is truncated and marked `untrusted_guest_or_provider`.
 * - Lists are bounded; output is size-capped by {@link truncateJson}.
 */
import type { AvailabilityEvaluationResult } from "../../../commerce/availability/AvailabilityEvaluator";
import type { UnitsCalendarBatchResult } from "../../../commerce/application/BatchCalendarReadUseCases";
import type { TenantDashboardOverviewReadModel } from "../../../commerce/ports/ITenantDashboardOverviewQuery";
import type { HousekeepingTodayBoard } from "../../../operations/ports/IHousekeepingTodayQuery";
import type { PropertyUnitCatalogResult } from "../../../catalog/types/PropertyUnitCatalog";
import type {
  ConversationRecord,
  MessageRecord,
  OwnerEscalationRecord,
} from "../../../messaging/domain/MessagingTypes";
import {
  MAX_BOOKING_SEARCH,
  MAX_CONVERSATION_MESSAGES,
  MAX_MESSAGE_BODY_CHARS,
  MAX_TOOL_RESULT_CHARS,
} from "../../domain/OperatorCopilotTypes";
import { wrapUntrustedGuestContent } from "../OperatorCopilotPolicy";

export const CONTENT_TRUST_UNTRUSTED = "untrusted_guest_or_provider" as const;
export const CONTENT_TRUST_INTERNAL = "internal" as const;
export type ContentTrust =
  | typeof CONTENT_TRUST_UNTRUSTED
  | typeof CONTENT_TRUST_INTERNAL;

const MAX_ESCALATIONS = 20;
const MAX_TASKS = 20;
const MAX_OVERVIEW_ITEMS = 10;
const MAX_CALENDAR_ITEMS_PER_UNIT = 25;
const MAX_CATALOG_UNITS_PER_PROPERTY = 100;
const MAX_HOUSEKEEPING_UNITS = 100;
const MAX_NAME_CHARS = 120;
const MAX_FREE_TEXT_CHARS = 240;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function clip(value: string | null | undefined, max: number): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** First whitespace-separated token of a full name. Never returns the surname. */
export function guestFirstNameOf(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0] ?? "";
  return clip(first.replace(/[,;]+$/, ""), 40);
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return value;
}

/**
 * Serialize `value` to JSON bounded by `maxChars`. When too large, returns a
 * valid JSON envelope: `{"truncated":true,"originalChars":N,"preview":"..."}`.
 */
export function truncateJson(
  value: unknown,
  maxChars: number = MAX_TOOL_RESULT_CHARS,
): string {
  let json: string;
  try {
    json = JSON.stringify(value) ?? "null";
  } catch {
    return JSON.stringify({ truncated: true, error: "unserializable_result" });
  }
  if (json.length <= maxChars) return json;

  const envelopeOverhead = 64;
  const previewBudget = Math.max(0, maxChars - envelopeOverhead);
  let preview = json.slice(0, previewBudget);
  let envelope = JSON.stringify({
    truncated: true,
    originalChars: json.length,
    preview,
  });
  // Escaping may inflate the preview; shrink until it fits.
  while (envelope.length > maxChars && preview.length > 0) {
    preview = preview.slice(0, Math.floor(preview.length * 0.9));
    envelope = JSON.stringify({
      truncated: true,
      originalChars: json.length,
      preview,
    });
  }
  return envelope;
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

/** Structural view satisfied by the `Booking` aggregate. */
export interface BookingSummarySource {
  id: string;
  propertyId: string;
  unitId: string;
  status: string;
  stayPeriod: { checkIn: { value: string }; checkOut: { value: string } };
  guestCount: { value: number };
  guest: { name: string };
}

export interface MinimizedBookingSummary {
  id: string;
  propertyId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  guestCount: number;
  guestFirstName: string | null;
}

export function minimizeBookingSummary(
  booking: BookingSummarySource,
): MinimizedBookingSummary {
  return {
    id: booking.id,
    propertyId: booking.propertyId,
    unitId: booking.unitId,
    checkIn: booking.stayPeriod.checkIn.value,
    checkOut: booking.stayPeriod.checkOut.value,
    status: booking.status,
    guestCount: booking.guestCount.value,
    guestFirstName: guestFirstNameOf(booking.guest.name),
  };
}

export function minimizeSearchBookings(page: {
  data: BookingSummarySource[];
  total: number;
  page: number;
  limit: number;
}): {
  total: number;
  page: number;
  returned: number;
  hasMore: boolean;
  bookings: MinimizedBookingSummary[];
} {
  const rows = page.data.slice(0, MAX_BOOKING_SEARCH).map(minimizeBookingSummary);
  return {
    total: page.total,
    page: page.page,
    returned: rows.length,
    hasMore: page.total > page.page * page.limit || page.data.length > rows.length,
    bookings: rows,
  };
}

// ---------------------------------------------------------------------------
// Today overview
// ---------------------------------------------------------------------------

interface SlimOverviewBooking {
  id: string;
  unitName: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  guestFirstName: string | null;
}

function slimOverviewBooking(
  b: TenantDashboardOverviewReadModel["todayArrivals"][number],
): SlimOverviewBooking {
  return {
    id: b.id,
    unitName: clip(b.unitName, MAX_NAME_CHARS),
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    status: b.status,
    guestFirstName: guestFirstNameOf(b.guestName),
  };
}

export function minimizeTodayOverview(overview: TenantDashboardOverviewReadModel) {
  return {
    localToday: overview.localToday,
    propertyTimezone: overview.propertyTimezone,
    counts: {
      properties: overview.propertyCount,
      units: overview.unitCount,
      arrivalsToday: overview.arrivalsToday,
      departuresToday: overview.departuresToday,
      inHouseToday: overview.inHouseToday,
      arrivalsNext7Days: overview.arrivalsNext7Days,
      departuresNext7Days: overview.departuresNext7Days,
      activeHolds: overview.activeHoldCount,
    },
    period: {
      label: overview.periodAnalytics.period.displayLabel,
      startDate: overview.periodAnalytics.period.startDate,
      endDateExclusive: overview.periodAnalytics.period.endDateExclusive,
      occupancyPct: overview.occupancyPct,
      bookingCount: overview.periodAnalytics.bookingCount,
      revenue: overview.revenue,
    },
    todayArrivals: overview.todayArrivals
      .slice(0, MAX_OVERVIEW_ITEMS)
      .map(slimOverviewBooking),
    todayDepartures: overview.todayDepartures
      .slice(0, MAX_OVERVIEW_ITEMS)
      .map(slimOverviewBooking),
    arrivalsListTruncated: overview.todayArrivals.length > MAX_OVERVIEW_ITEMS,
    departuresListTruncated: overview.todayDepartures.length > MAX_OVERVIEW_ITEMS,
  };
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

export function minimizeHousekeeping(board: HousekeepingTodayBoard) {
  return {
    propertyId: board.propertyId,
    propertyName: clip(board.propertyName, MAX_NAME_CHARS),
    localToday: board.localToday,
    summary: board.summary,
    units: board.units.slice(0, MAX_HOUSEKEEPING_UNITS).map((u) => ({
      unitId: u.unitId,
      unit: clip(u.unitName, MAX_NAME_CHARS),
      status: u.housekeepingStatus,
      hasDeparture: u.departing !== null,
      hasArrival: u.arriving !== null,
      arrivalBookingId: u.arriving?.bookingId ?? null,
      departureBookingId: u.departing?.bookingId ?? null,
      readyForArrival: u.readyForArrival,
      arrivalNeedsClean: u.arrivalNeedsClean,
    })),
    overdueTaskCount: board.overdueTasks.length,
    overdueTasks: board.overdueTasks.slice(0, MAX_TASKS).map((t) => ({
      id: t.id,
      title: clip(t.title, MAX_NAME_CHARS),
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt,
    })),
    unitsTruncated: board.units.length > MAX_HOUSEKEEPING_UNITS,
  };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export function minimizeCalendar(
  snapshot: UnitsCalendarBatchResult,
  unitNames?: Record<string, string>,
) {
  const units = Object.entries(snapshot).map(([unitId, cal]) => {
    const items = {
      bookings: cal.bookings.slice(0, MAX_CALENDAR_ITEMS_PER_UNIT).map((b) => ({
        id: b.id,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        status: b.status,
        guestFirstName: guestFirstNameOf(b.guestName),
      })),
      holds: cal.holds.slice(0, MAX_CALENDAR_ITEMS_PER_UNIT).map((h) => ({
        checkIn: h.checkIn,
        checkOut: h.checkOut,
        status: h.status,
      })),
      blocks: cal.blocks.slice(0, MAX_CALENDAR_ITEMS_PER_UNIT).map((b) => ({
        type: b.blockType,
        status: b.status,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
      })),
    };
    return {
      unitId,
      unit: unitNames?.[unitId] ? clip(unitNames[unitId], MAX_NAME_CHARS) : null,
      ...items,
      counts: {
        bookings: cal.bookings.length,
        holds: cal.holds.length,
        blocks: cal.blocks.length,
      },
    };
  });
  return { unitCount: units.length, units };
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export function minimizeAvailability(result: AvailabilityEvaluationResult) {
  return {
    available: result.available,
    nights: result.nights.length,
    reasons: result.reasons.slice(0, 10).map((r) => ({
      code: r.code,
      message: clip(r.message, MAX_FREE_TEXT_CHARS),
    })),
    warnings: result.warnings.slice(0, 5).map((w) => ({
      code: w.code,
      message: clip(w.message, MAX_FREE_TEXT_CHARS),
    })),
    unavailableDates: result.nights
      .filter((n) => !n.available)
      .slice(0, 31)
      .map((n) => n.date),
  };
}

// ---------------------------------------------------------------------------
// Conversation (guest content => UNTRUSTED)
// ---------------------------------------------------------------------------

export interface MinimizeConversationOptions {
  /** Wrap untrusted bodies in explicit markers (default true). */
  wrapUntrusted?: boolean;
  maxMessages?: number;
  maxBodyChars?: number;
}

function isUntrustedMessage(m: MessageRecord): boolean {
  return m.direction === "inbound" || m.senderType === "guest";
}

export function minimizeConversationSummary(
  input: { conversation: ConversationRecord; messages: MessageRecord[] },
  opts: MinimizeConversationOptions = {},
) {
  const wrap = opts.wrapUntrusted !== false;
  const maxMessages = Math.min(
    opts.maxMessages ?? MAX_CONVERSATION_MESSAGES,
    MAX_CONVERSATION_MESSAGES,
  );
  const maxBody = Math.min(
    opts.maxBodyChars ?? MAX_MESSAGE_BODY_CHARS,
    MAX_MESSAGE_BODY_CHARS,
  );

  const { conversation, messages } = input;
  const recent = messages.slice(-maxMessages);

  const subject = clip(conversation.subject, MAX_NAME_CHARS);

  return {
    conversation: {
      id: conversation.id,
      propertyId: conversation.propertyId,
      bookingId: conversation.bookingId,
      channel: conversation.channel,
      status: conversation.status,
      lastMessageAt: isoOrNull(conversation.lastMessageAt),
      subject: subject && wrap ? wrapUntrustedGuestContent(subject) : subject,
      subjectTrust: CONTENT_TRUST_UNTRUSTED,
    },
    totalMessages: messages.length,
    shownMessages: recent.length,
    omittedEarlierMessages: Math.max(0, messages.length - recent.length),
    messages: recent.map((m) => {
      const untrusted = isUntrustedMessage(m);
      const body = clip(m.body, maxBody) ?? "";
      return {
        at: isoOrNull(m.createdAt),
        direction: m.direction,
        sender: m.senderType,
        body: untrusted && wrap ? wrapUntrustedGuestContent(body) : body,
        contentTrust: untrusted ? CONTENT_TRUST_UNTRUSTED : CONTENT_TRUST_INTERNAL,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------

export function minimizeEscalations(escalations: OwnerEscalationRecord[]) {
  const rows = escalations.slice(0, MAX_ESCALATIONS).map((e) => ({
    id: e.id,
    propertyId: e.propertyId,
    conversationId: e.conversationId,
    bookingId: e.bookingId,
    classification: e.classification,
    status: e.status,
    createdAt: isoOrNull(e.createdAt),
    // Derived from guest text by an AI: still untrusted data.
    reason: wrapUntrustedGuestContent(clip(e.reason, MAX_FREE_TEXT_CHARS) ?? ""),
    summaryForOwner: wrapUntrustedGuestContent(
      clip(e.summaryForOwner, MAX_FREE_TEXT_CHARS) ?? "",
    ),
    contentTrust: CONTENT_TRUST_UNTRUSTED,
  }));
  return {
    total: escalations.length,
    returned: rows.length,
    escalations: rows,
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Structural view satisfied by the `Task` aggregate. */
export interface TaskSummarySource {
  id: string;
  propertyId: string;
  unitId: string | null;
  bookingId: string | null;
  category: string;
  title: string;
  status: string;
  priority: string;
  dueAt: Date | null;
}

export function minimizeTasks(
  page: { data: TaskSummarySource[]; total: number },
  now: Date = new Date(),
) {
  const rows = page.data.slice(0, MAX_TASKS).map((t) => {
    const open = t.status === "OPEN" || t.status === "IN_PROGRESS";
    return {
      id: t.id,
      propertyId: t.propertyId,
      unitId: t.unitId,
      bookingId: t.bookingId,
      category: t.category,
      title: clip(t.title, MAX_NAME_CHARS),
      status: t.status,
      priority: t.priority,
      dueAt: isoOrNull(t.dueAt),
      overdue: open && t.dueAt !== null && t.dueAt.getTime() < now.getTime(),
    };
  });
  return { total: page.total, returned: rows.length, tasks: rows };
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export function minimizeCatalog(catalog: PropertyUnitCatalogResult) {
  return {
    properties: catalog.properties.map((p) => ({
      id: p.id,
      name: clip(p.name, MAX_NAME_CHARS),
      units: p.units.slice(0, MAX_CATALOG_UNITS_PER_PROPERTY).map((u) => {
        const code = (u as { code?: string | null }).code;
        return {
          id: u.id,
          name: clip(u.name, MAX_NAME_CHARS),
          ...(code ? { code: clip(code, 40) } : {}),
        };
      }),
      unitsTruncated: p.units.length > MAX_CATALOG_UNITS_PER_PROPERTY,
    })),
  };
}
