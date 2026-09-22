import type {
  BookingComAriPushError,
  BookingComAriPushRequest,
  BookingComAriPushResult,
} from "./IBookingComAriClient";
import { BookingComRuid } from "../ids/BookingComIds";

/**
 * Build B.XML availability request body from a hotel-scoped monthly batch.
 * @see https://developers.booking.com/connectivity/docs/b_xml-availability
 */
export function buildBookingComAriAvailabilityXml(
  request: BookingComAriPushRequest,
): string {
  const chunks: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<request>"];

  for (const seg of request.availability) {
    chunks.push(`  <room id="${escapeXml(seg.roomTypeId)}">`);
    chunks.push(...dateOpen(seg.dateRange.from, seg.dateRange.to));
    if (seg.roomsToSell != null) {
      chunks.push(`      <roomstosell>${seg.roomsToSell}</roomstosell>`);
    }
    if (seg.closed != null) {
      chunks.push(`      <closed>${seg.closed}</closed>`);
    }
    chunks.push(...dateClose());
    chunks.push("  </room>");
  }

  for (const seg of request.rates) {
    chunks.push(`  <room id="${escapeXml(seg.roomTypeId)}">`);
    chunks.push(...dateOpen(seg.dateRange.from, seg.dateRange.to));
    chunks.push(`      <currencycode>${escapeXml(seg.currencyCode)}</currencycode>`);
    chunks.push(`      <rate id="${escapeXml(seg.ratePlanId)}"/>`);
    if (seg.price != null) {
      chunks.push(`      <price>${escapeXml(seg.price)}</price>`);
    }
    if (seg.price1 != null) {
      chunks.push(`      <price1>${escapeXml(seg.price1)}</price1>`);
    }
    chunks.push(...dateClose());
    chunks.push("  </room>");
  }

  for (const seg of request.restrictions) {
    chunks.push(`  <room id="${escapeXml(seg.roomTypeId)}">`);
    chunks.push(...dateOpen(seg.dateRange.from, seg.dateRange.to));
    chunks.push(`      <rate id="${escapeXml(seg.ratePlanId)}"/>`);
    if (seg.minimumStay != null) {
      chunks.push(`      <minimumstay>${seg.minimumStay}</minimumstay>`);
    }
    if (seg.maximumStay != null) {
      chunks.push(`      <maximumstay>${seg.maximumStay}</maximumstay>`);
    }
    if (seg.closedToArrival != null) {
      chunks.push(`      <closedonarrival>${seg.closedToArrival}</closedonarrival>`);
    }
    if (seg.closedToDeparture != null) {
      chunks.push(
        `      <closedondeparture>${seg.closedToDeparture}</closedondeparture>`,
      );
    }
    chunks.push(...dateClose());
    chunks.push("  </room>");
  }

  chunks.push("</request>");
  return chunks.join("\n");
}

export function parseBookingComAriPushResponse(input: {
  httpStatus: number;
  body: string;
}): BookingComAriPushResult {
  const ruid = extractRuid(input.body);
  const errors = extractErrors(input.body);
  const warnings: BookingComAriPushError[] = [];

  const retryableHttp =
    input.httpStatus === 429 ||
    input.httpStatus === 408 ||
    (input.httpStatus >= 500 && input.httpStatus <= 599);

  if (retryableHttp) {
    return {
      success: false,
      httpStatus: input.httpStatus,
      ruid,
      errors:
        errors.length > 0
          ? errors
          : [
              {
                code: `HTTP_${input.httpStatus}`,
                message: `Retryable HTTP ${input.httpStatus}`,
                roomTypeId: null,
                ratePlanId: null,
                dates: null,
              },
            ],
      warnings,
    };
  }

  if (input.httpStatus >= 400) {
    return {
      success: false,
      httpStatus: input.httpStatus,
      ruid,
      errors:
        errors.length > 0
          ? errors
          : [
              {
                code: `HTTP_${input.httpStatus}`,
                message: `Permanent HTTP ${input.httpStatus}`,
                roomTypeId: null,
                ratePlanId: null,
                dates: null,
              },
            ],
      warnings,
    };
  }

  // HTTP 2xx still requires body inspection (Booking.com partial errors).
  if (errors.length > 0) {
    return {
      success: false,
      httpStatus: input.httpStatus,
      ruid,
      errors,
      warnings,
    };
  }

  return {
    success: true,
    httpStatus: input.httpStatus,
    ruid,
    errors: [],
    warnings,
  };
}

export function classifyBookingComAriPushResult(result: BookingComAriPushResult):
  | "full_success"
  | "partial_error"
  | "retryable_failure"
  | "permanent_failure" {
  if (result.success && result.errors.length === 0) return "full_success";
  if (
    result.httpStatus === 429 ||
    result.httpStatus === 408 ||
    (result.httpStatus >= 500 && result.httpStatus <= 599)
  ) {
    return "retryable_failure";
  }
  if (result.httpStatus >= 200 && result.httpStatus < 300 && result.errors.length > 0) {
    return "partial_error";
  }
  return "permanent_failure";
}

function dateOpen(from: string, to: string): string[] {
  if (nextDay(from) === to) {
    return [`    <date value="${from}">`];
  }
  return [`    <date from="${from}" to="${to}">`];
}

function dateClose(): string[] {
  return ["    </date>"];
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractRuid(body: string): ReturnType<typeof BookingComRuid> | null {
  const comment = body.match(/<!--\s*RUID:\s*\[([^\]]+)\]\s*-->/i);
  if (comment?.[1]) {
    try {
      return BookingComRuid(comment[1].trim());
    } catch {
      return null;
    }
  }
  return null;
}

function extractErrors(body: string): BookingComAriPushError[] {
  const errors: BookingComAriPushError[] = [];
  const errorBlocks = body.matchAll(/<error\b([^>]*)>([\s\S]*?)<\/error>/gi);
  for (const match of errorBlocks) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    const codeMatch = attrs.match(/\bcode\s*=\s*"([^"]+)"/i);
    const message =
      textContent(inner, "message") ??
      inner.replace(/<[^>]+>/g, " ").trim() ??
      "Booking.com ARI error";
    errors.push({
      code: codeMatch?.[1] ?? "UNKNOWN",
      message,
      roomTypeId: textContent(inner, "room_ids"),
      ratePlanId: textContent(inner, "rate_ids"),
      dates: textContent(inner, "dates"),
    });
  }
  return errors;
}

function textContent(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<(?:\\w+:)?${localName}\\b[^>]*>([^<]*)</(?:\\w+:)?${localName}>`,
    "i",
  );
  const match = xml.match(re);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}
