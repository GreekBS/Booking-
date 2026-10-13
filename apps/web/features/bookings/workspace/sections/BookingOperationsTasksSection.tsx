"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { listTasks } from "@/lib/admin/api";
import type { TaskRecord } from "@/lib/admin/types";
import { formatOperatorDate } from "@/lib/admin/money-presentation";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceSection } from "@/features/workspace/components/WorkspaceSection";
import { elCommon, elPriority, elTaskCategory, statusLabelEl } from "@/lib/i18n";

function categoryLabel(category: string): string {
  return elTaskCategory[category] ?? category.replace(/_/g, " ").toLowerCase();
}

/**
 * Compact operational Tasks for a Booking — authoritative Task.bookingId only.
 * Mutations stay in Housekeeping; this is overview + navigation.
 */
export function BookingOperationsTasksSection({
  bookingId,
  propertyId,
  unitId,
  active,
}: {
  bookingId: string;
  propertyId: string;
  unitId: string;
  active: boolean;
}) {
  const { tenantId } = useTenant();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !active) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listTasks(tenantId, {
        propertyId,
        bookingId,
        status: ["OPEN", "IN_PROGRESS"],
        page: 1,
        limit: 10,
      });
      setTasks(res.data);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης εργασιών");
      setTasks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId, bookingId, active]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCount = tasks.filter((t) => t.status === "OPEN").length;
  const inProgressCount = tasks.filter((t) => t.status === "IN_PROGRESS").length;

  const hkHref = `/dashboard/housekeeping?view=all&bookingId=${encodeURIComponent(bookingId)}`;
  const createHref = `${hkHref}&create=1&unitId=${encodeURIComponent(unitId)}`;

  return (
    <WorkspaceSection
      title="Λειτουργικές εργασίες"
      badge={
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="h-9 text-xs" asChild>
            <Link href={createHref}>
              <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              Δημιουργία εργασίας
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-9 text-xs" asChild>
            <Link href={hkHref}>
              Όλες οι εργασίες
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      }
    >
      <p className="text-xs text-foreground/70">
        {loading
          ? elCommon.loading
          : total === 0
            ? "Δεν υπάρχουν ανοιχτές λειτουργικές εργασίες."
            : `${openCount} ανοιχτές · ${inProgressCount} σε εξέλιξη`}
      </p>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading && tasks.length === 0 ? <Skeleton className="h-16 w-full" /> : null}

      {tasks.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border/70">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                <p className="text-xs text-foreground/70">
                  {categoryLabel(task.category)}
                  {task.priority !== "NORMAL"
                    ? ` · ${elPriority[task.priority] ?? task.priority}`
                    : ""}
                  {task.dueAt ? ` · προθεσμία ${formatOperatorDate(task.dueAt)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={task.status} label={statusLabelEl(task.status)} />
                <Button variant="outline" size="sm" className="h-9 min-h-9 text-xs" asChild>
                  <Link
                    href={`/dashboard/housekeeping?view=all&taskId=${encodeURIComponent(task.id)}&bookingId=${encodeURIComponent(bookingId)}`}
                  >
                    Στην καθαριότητα
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </WorkspaceSection>
  );
}
