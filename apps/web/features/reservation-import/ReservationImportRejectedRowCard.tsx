"use client";

import { Surface } from "@/components/admin/surface";
import type { ReservationImportRejectedRowDto } from "@/lib/admin/reservation-import-api";
import { formatImportStayRange } from "./reservation-import-review-utils";

function issueText(item: unknown): string {
  if (item && typeof item === "object" && "message" in item) {
    const msg = (item as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  try {
    return JSON.stringify(item);
  } catch {
    return String(item);
  }
}

type Props = {
  row: ReservationImportRejectedRowDto;
};

export function ReservationImportRejectedRowCard({ row }: Props) {
  const payload = row.payload ?? {};
  const guestName =
    typeof payload.guestName === "string" ? payload.guestName : null;
  const unitRef = typeof payload.unitRef === "string" ? payload.unitRef : null;
  const checkIn = typeof payload.checkIn === "string" ? payload.checkIn : null;
  const checkOut = typeof payload.checkOut === "string" ? payload.checkOut : null;
  const externalReference =
    typeof payload.externalReference === "string" ? payload.externalReference : null;

  return (
    <Surface variant="panel" padding="md" className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        Γραμμή CSV #{row.rowNumber}
        {guestName ? ` · ${guestName}` : null}
      </p>
      <p className="text-xs text-muted-foreground">
        Δεν εισήχθη στο πρόχειρο — μόνο διαγνωστικά.
      </p>
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        {externalReference ? (
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Αναφορά</dt>
            <dd>{externalReference}</dd>
          </div>
        ) : null}
        {unitRef ? (
          <div>
            <dt className="text-[11px] uppercase text-muted-foreground">Μονάδα (CSV)</dt>
            <dd>{unitRef}</dd>
          </div>
        ) : null}
        {checkIn && checkOut ? (
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase text-muted-foreground">Διαμονή</dt>
            <dd>{formatImportStayRange(checkIn, checkOut)}</dd>
          </div>
        ) : null}
      </dl>
      {row.errors.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-destructive" role="alert">
          {row.errors.map((e, i) => (
            <li key={i}>{issueText(e)}</li>
          ))}
        </ul>
      ) : null}
      {row.warnings.length > 0 ? (
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {row.warnings.map((w, i) => (
            <li key={i}>{issueText(w)}</li>
          ))}
        </ul>
      ) : null}
    </Surface>
  );
}
