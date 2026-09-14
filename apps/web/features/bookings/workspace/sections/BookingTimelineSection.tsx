"use client";

import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";
import { WorkspaceSection } from "@/features/workspace/components/WorkspaceSection";
import { buildBookingTimeline } from "../../booking-timeline";
import type { BookingSectionProps } from "../types";

export function BookingTimelineSection({ booking }: BookingSectionProps) {
  const steps = buildBookingTimeline(booking.status);

  return (
    <WorkspaceSection title="Timeline">
      <ol className="relative space-y-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;

          return (
            <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute left-[5px] top-3 h-[calc(100%-4px)] w-px bg-border"
                />
              )}
              <span
                className={cn(
                  "relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-background",
                  step.active ? "bg-primary" : "bg-muted",
                  step.current && "ring-2 ring-primary/30",
                )}
              />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("text-sm", step.current ? "font-medium" : "text-muted-foreground")}>
                    {step.label}
                  </span>
                  {step.current && <StatusBadge status={booking.status} />}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </WorkspaceSection>
  );
}
