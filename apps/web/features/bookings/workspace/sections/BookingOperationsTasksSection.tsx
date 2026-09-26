"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { listTasks } from "@/lib/admin/api";
import type { TaskRecord } from "@/lib/admin/types";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function statusLabel(status: string): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

function categoryLabel(category: string): string {
  return category.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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
      setError(err instanceof Error ? err.message : "Failed to load tasks");
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
    <section aria-labelledby="booking-ops-tasks-heading" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3
            id="booking-ops-tasks-heading"
            className="text-sm font-semibold text-foreground"
          >
            Operational tasks
          </h3>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Loading…"
              : total === 0
                ? "No open operational tasks."
                : `${openCount} open · ${inProgressCount} in progress`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href={createHref}>
              <ClipboardList className="h-3.5 w-3.5" aria-hidden />
              Create task
            </Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link href={hkHref}>
              View all tasks
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading && tasks.length === 0 ? (
        <Skeleton className="h-16 w-full" />
      ) : null}

      {!loading && tasks.length === 0 && !error ? (
        <p className="text-xs text-muted-foreground">No open operational tasks.</p>
      ) : null}

      {tasks.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border/70">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-sm font-medium">{task.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {categoryLabel(task.category)}
                  {task.priority !== "NORMAL" ? ` · ${task.priority}` : ""}
                  {task.dueAt
                    ? ` · due ${new Date(task.dueAt).toISOString().slice(0, 10)}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={task.status} label={statusLabel(task.status)} />
                <Button variant="outline" size="sm" className="h-8 min-h-8 text-xs" asChild>
                  <Link
                    href={`/dashboard/housekeeping?view=all&taskId=${encodeURIComponent(task.id)}&bookingId=${encodeURIComponent(bookingId)}`}
                  >
                    View in Housekeeping
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
