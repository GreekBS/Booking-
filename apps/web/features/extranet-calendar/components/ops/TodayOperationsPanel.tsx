"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TODAY_OPS_PANEL_STORAGE_KEY } from "../../constants";
import { useCalendarActions } from "../../context/CalendarActionsContext";
import { useCalendarOpsActions } from "../../context/CalendarOpsActionsContext";
import { buildTodayOperations, type TodayOpItem } from "../../lib/today-operations";
import type { RackPropertyGroup } from "../../types";

interface TodayOperationsPanelProps {
  groups: RackPropertyGroup[];
  today: string;
}

function readPanelOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = sessionStorage.getItem(TODAY_OPS_PANEL_STORAGE_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

function Section({
  title,
  items,
  emptyLabel,
  onSelect,
}: {
  title: string;
  items: TodayOpItem[];
  emptyLabel: string;
  onSelect: (item: TodayOpItem) => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
        <span className="ml-1 font-normal tabular-nums">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/80">{emptyLabel}</p>
      ) : (
        <ul className="max-h-24 space-y-0.5 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full rounded-md px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-primary-subtle/60 focus-visible:bg-primary-subtle/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                onClick={() => onSelect(item)}
              >
                <span className="block truncate font-medium text-foreground">{item.label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {item.unitName} · {item.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TodayOperationsPanel({ groups, today }: TodayOperationsPanelProps) {
  const { calendarsByUnit } = useCalendarActions();
  const { openWorkspaceForTodayItem } = useCalendarOpsActions();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(readPanelOpen());
  }, []);

  const snapshot = useMemo(
    () => buildTodayOperations(groups, calendarsByUnit, today),
    [groups, calendarsByUnit, today],
  );

  const totalCount =
    snapshot.arrivals.length +
    snapshot.departures.length +
    snapshot.inHouse.length +
    snapshot.holds.length +
    snapshot.blocks.length;

  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(TODAY_OPS_PANEL_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs font-semibold"
          onClick={toggleOpen}
          aria-expanded={open}
        >
          Today · {today}
          <span className="font-normal text-muted-foreground">({totalCount})</span>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </Button>
        <span className="hidden text-[10px] text-muted-foreground sm:inline">
          Day-level inventory operations from loaded calendar data
        </span>
      </div>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="grid gap-3 border-t border-border bg-surface-subtle/30 px-3 py-2 sm:grid-cols-2 lg:grid-cols-5">
            <Section
              title="Arrivals"
              items={snapshot.arrivals}
              emptyLabel="None today"
              onSelect={openWorkspaceForTodayItem}
            />
            <Section
              title="Departures"
              items={snapshot.departures}
              emptyLabel="None today"
              onSelect={openWorkspaceForTodayItem}
            />
            <Section
              title="In-house"
              items={snapshot.inHouse}
              emptyLabel="None tonight"
              onSelect={openWorkspaceForTodayItem}
            />
            <Section
              title="Holds"
              items={snapshot.holds}
              emptyLabel="No active holds"
              onSelect={openWorkspaceForTodayItem}
            />
            <Section
              title="Blocks"
              items={snapshot.blocks}
              emptyLabel="No blocks today"
              onSelect={openWorkspaceForTodayItem}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
