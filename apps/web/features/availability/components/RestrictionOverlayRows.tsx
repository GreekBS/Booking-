"use client";

import { cn } from "@/lib/utils";
import { CELL_WIDTH_PX, isWeekendUtc, UNIT_COL_WIDTH_PX } from "../lib/calendar-utils";
import type { AvailabilityRulesRecord } from "@/lib/admin/types";
import type { OverlayToggles } from "../types";

interface RestrictionOverlayRowsProps {
  rules: AvailabilityRulesRecord;
  dates: string[];
  overlays: OverlayToggles;
}

export function RestrictionOverlayRows({
  rules,
  dates,
  overlays,
}: RestrictionOverlayRowsProps) {
  const showMin = overlays.minStay;
  const showMax = overlays.maxStay;
  const showCta = overlays.cta;
  const showCtd = overlays.ctd;

  if (!showMin && !showMax && !showCta && !showCtd) return null;

  return (
    <>
      {showMin && (
        <OverlayRow label={`Min ${rules.minNights}n`}>
          {dates.map((date) => (
            <OverlayCell key={date} date={date} title={`Min stay: ${rules.minNights} nights`}>
              {rules.minNights}
            </OverlayCell>
          ))}
        </OverlayRow>
      )}
      {showMax && (
        <OverlayRow label={`Max ${rules.maxNights}n`}>
          {dates.map((date) => (
            <OverlayCell key={date} date={date} title={`Max stay: ${rules.maxNights} nights`}>
              {rules.maxNights}
            </OverlayCell>
          ))}
        </OverlayRow>
      )}
      {showCta && (
        <OverlayRow label="CTA">
          {dates.map((date) => {
            const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
            const allowed = rules.checkInDays.includes(dow);
            return (
              <OverlayCell
                key={date}
                date={date}
                title={allowed ? "Check-in allowed" : "Closed to arrival"}
                className={allowed ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground/50"}
              >
                {allowed ? "↓" : "·"}
              </OverlayCell>
            );
          })}
        </OverlayRow>
      )}
      {showCtd && (
        <OverlayRow label="CTD">
          {dates.map((date) => {
            const dow = new Date(`${date}T00:00:00.000Z`).getUTCDay();
            const allowed = rules.checkOutDays.includes(dow);
            return (
              <OverlayCell
                key={date}
                date={date}
                title={allowed ? "Check-out allowed" : "Closed to departure"}
                className={allowed ? "text-sky-700 dark:text-sky-400" : "text-muted-foreground/50"}
              >
                {allowed ? "↑" : "·"}
              </OverlayCell>
            );
          })}
        </OverlayRow>
      )}
    </>
  );
}

function OverlayRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex border-b bg-muted/10 text-[9px] text-muted-foreground transition-colors">
      <div
        className="sticky left-0 z-10 shrink-0 truncate border-r bg-muted/10 px-2 py-0.5 font-medium"
        style={{ width: UNIT_COL_WIDTH_PX }}
      >
        {label}
      </div>
      <div className="flex">{children}</div>
    </div>
  );
}

function OverlayCell({
  date,
  children,
  title,
  className,
}: {
  date: string;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "shrink-0 border-r py-0.5 text-center tabular-nums",
        isWeekendUtc(date) && "bg-muted/20",
        className,
      )}
      style={{ width: CELL_WIDTH_PX, height: 18 }}
      title={title}
    >
      {children}
    </div>
  );
}
