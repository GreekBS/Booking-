"use client";

import { StatusBadge } from "@/components/admin/status-badge";
import type {
  ReservationImportRejectedRowDto,
  ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";
import { csvIssueMessageEl } from "./csv-issue-messages";
import {
  formatRowPriceAmount,
  rowHasExistingBookingConflicts,
  rowHasHardBlockers,
  rowStatusLabel,
  type ReadinessCounts,
} from "./reservation-import-review-utils";

type Props = {
  rows: ReservationImportRowDto[];
  rejectedRows: ReservationImportRejectedRowDto[];
  counts: ReadinessCounts;
  unitLabel: (unitId: string) => string;
};

function formatPreviewDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

function formatAmount(row: ReservationImportRowDto): string {
  const formatted = formatRowPriceAmount(row);
  if (!formatted) return "—";
  if (formatted.endsWith(" EUR")) {
    return `€${formatted.slice(0, -4)}`;
  }
  return formatted;
}

function rejectedPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : "—";
}

function rejectedPayloadNumber(
  payload: Record<string, unknown>,
  key: string,
): string {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}

function draftRowAttention(row: ReservationImportRowDto): string | null {
  if (row.errorMessage) return row.errorMessage;
  if (row.errorCode) return row.errorCode;
  if (rowHasHardBlockers(row)) {
    return "Σύγκρουση με μπλοκ ημερολογίου — απαιτείται ενέργεια.";
  }
  if (rowHasExistingBookingConflicts(row) && row.conflictResolution === "undecided") {
    return "Σύγκρουση με υπάρχουσα κράτηση — απαιτείται απόφαση.";
  }
  if (row.status === "pending" && row.priceSource === "unresolved") {
    return "Λείπει τιμή — ορίστε τιμή TALOS ή χειροκίνητη.";
  }
  if (row.status === "pending") {
    return "Χρειάζεται ενέργεια πριν την εισαγωγή.";
  }
  return null;
}

function rejectedAttention(row: ReservationImportRejectedRowDto): string {
  const issues = Array.isArray(row.errors) ? row.errors : [];
  const messages = issues
    .map((issue) => {
      if (
        issue &&
        typeof issue === "object" &&
        "code" in issue &&
        typeof (issue as { code: unknown }).code === "string"
      ) {
        return csvIssueMessageEl(issue as Parameters<typeof csvIssueMessageEl>[0]);
      }
      return null;
    })
    .filter((m): m is string => Boolean(m));
  if (messages.length > 0) return messages.join(" · ");
  return "Η γραμμή απορρίφθηκε και δεν θα εισαχθεί.";
}

/**
 * Draft-stage Preview table — still creates no bookings until commit.
 */
export function ReservationImportDraftPreviewTable({
  rows,
  rejectedRows,
  counts,
  unitLabel,
}: Props) {
  const totalFound = counts.accepted + counts.rejected;
  const needAttention = counts.needAction + counts.rejected;
  const sortedRows = [...rows].sort((a, b) => a.rowNumber - b.rowNumber);
  const sortedRejected = [...rejectedRows].sort(
    (a, b) => a.rowNumber - b.rowNumber,
  );

  return (
    <div className="space-y-4" data-testid="reservation-import-draft-preview">
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">
          {totalFound}{" "}
          {totalFound === 1 ? "κράτηση βρέθηκε" : "κρατήσεις βρέθηκαν"}
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusBadge status="confirmed" label={`${counts.ready} Έτοιμες`} />
          <StatusBadge
            status={needAttention > 0 ? "cancelled" : "completed"}
            label={`${needAttention} Χρειάζονται προσοχή`}
          />
          {counts.skipped > 0 ? (
            <StatusBadge
              status="pending"
              label={`${counts.skipped} Παραλείπονται`}
            />
          ) : null}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" role="note">
        Προεπισκόπηση πρόχειρης εισαγωγής — οι κρατήσεις δημιουργούνται μόνο όταν
        πατήσετε «Εισαγωγή κρατήσεων».
      </p>

      <div className="max-h-[min(32rem,65vh)] overflow-auto rounded-md border border-border">
        <table className="min-w-[56rem] w-full text-left text-xs sm:text-sm">
          <thead className="sticky top-0 bg-muted/95 text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Επισκέπτης</th>
              <th className="px-3 py-2 font-medium">Άφιξη</th>
              <th className="px-3 py-2 font-medium">Αναχώρηση</th>
              <th className="px-3 py-2 font-medium">Δωμάτιο</th>
              <th className="px-3 py-2 font-medium">Επισκέπτες</th>
              <th className="px-3 py-2 font-medium">Τηλέφωνο</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Ποσό</th>
              <th className="px-3 py-2 font-medium">Αναφορά</th>
              <th className="px-3 py-2 font-medium">Κατάσταση</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const attention = draftRowAttention(row);
              const ready = row.status === "ready";
              const unitRef =
                typeof row.payload?.unitRef === "string"
                  ? row.payload.unitRef
                  : null;
              return (
                <tr
                  key={row.id}
                  className={
                    ready
                      ? "border-t border-border"
                      : "border-t border-destructive/25 bg-destructive/5"
                  }
                  data-testid={`import-draft-preview-row-${row.rowNumber}`}
                  data-preview-ready={ready ? "true" : "false"}
                >
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {row.rowNumber}
                  </td>
                  <td className="px-3 py-2 font-medium">{row.guestName}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatPreviewDate(row.checkIn)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatPreviewDate(row.checkOut)}
                  </td>
                  <td className="px-3 py-2">
                    {unitLabel(row.unitId)}
                    {unitRef ? (
                      <span className="block text-[11px] text-muted-foreground">
                        {unitRef}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.guestCount}</td>
                  <td className="px-3 py-2">{row.guestPhone ?? "—"}</td>
                  <td className="px-3 py-2 break-all">
                    {row.guestEmail ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatAmount(row)}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {row.externalReference}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <StatusBadge
                        status={row.status}
                        label={rowStatusLabel(row.status)}
                      />
                      {attention ? (
                        <p className="max-w-[14rem] text-[11px] leading-snug text-destructive">
                          {attention}
                        </p>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {sortedRejected.map((row) => {
              const payload = row.payload ?? {};
              return (
                <tr
                  key={row.id}
                  className="border-t border-destructive/25 bg-destructive/5"
                  data-testid={`import-draft-preview-rejected-${row.rowNumber}`}
                  data-preview-ready="false"
                >
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {row.rowNumber}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {rejectedPayloadString(payload, "guestName")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatPreviewDate(
                      rejectedPayloadString(payload, "checkIn") === "—"
                        ? null
                        : rejectedPayloadString(payload, "checkIn"),
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatPreviewDate(
                      rejectedPayloadString(payload, "checkOut") === "—"
                        ? null
                        : rejectedPayloadString(payload, "checkOut"),
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {rejectedPayloadString(payload, "unitRef")}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {rejectedPayloadNumber(payload, "guestCount")}
                  </td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2 break-all">
                    {rejectedPayloadString(payload, "guestEmail")}
                  </td>
                  <td className="px-3 py-2">—</td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {rejectedPayloadString(payload, "externalReference")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <StatusBadge status="cancelled" label="Πρόβλημα" />
                      <p className="max-w-[14rem] text-[11px] leading-snug text-destructive">
                        {rejectedAttention(row)}
                      </p>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
