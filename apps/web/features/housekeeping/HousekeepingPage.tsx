"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import {
  AdminApiError,
  createTask,
  fetchHousekeepingToday,
  fetchMembers,
  fetchPropertyUnitCatalog,
  fetchTask,
  listTasks,
  markUnitHousekeeping,
  mutateTask,
} from "@/lib/admin/api";
import type {
  HousekeepingTodayBoard,
  MemberRecord,
  TaskCategory,
  TaskPriority,
  TaskRecord,
} from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Pagination } from "@/components/admin/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CleaningLocationsPanel } from "@/features/housekeeping/CleaningLocationsPanel";
import {
  elCommon,
  elNav,
  elPriority,
  statusLabelEl,
  taskCategoryLabelEl,
} from "@/lib/i18n";

const PAGE_SIZE = 20;

const CATEGORIES: TaskCategory[] = [
  "HOUSEKEEPING",
  "MAINTENANCE",
  "INSPECTION",
  "GUEST_REQUEST",
  "GENERAL",
];

function priorityLabel(priority: string): string {
  return elPriority[priority] ?? elPriority.NORMAL ?? priority;
}

function assigneeName(
  userId: string | null | undefined,
  members: MemberRecord[],
): string {
  if (!userId) return "Χωρίς ανάθεση";
  const m = members.find((x) => x.userId === userId);
  return m?.user?.name || m?.user?.email || "Ανατεθειμένο";
}

function conflictMessage(err: unknown): string | null {
  if (err instanceof AdminApiError && (err.status === 409 || err.code === "CONFLICT")) {
    return "Η εργασία άλλαξε από όταν την ανοίξατε. Φορτώθηκε η τελευταία κατάσταση.";
  }
  return null;
}

export function HousekeepingPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <HousekeepingPageContent />
    </Suspense>
  );
}

function HousekeepingPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { tenantId, profile, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();

  const viewParam = searchParams.get("view");
  const view = (viewParam === "all" || viewParam === "tasks" ? "all" : "today") as
    | "today"
    | "all";
  const filterStatus = searchParams.get("status") ?? "";
  const filterCategory = searchParams.get("category") ?? "";
  const filterAssignee = searchParams.get("assignee") ?? "";
  const filterPriority = searchParams.get("priority") ?? "";
  const filterBookingId = searchParams.get("bookingId") ?? "";
  const createPresetUnitId = searchParams.get("unitId") ?? "";
  const openCreate = searchParams.get("create") === "1";
  const deepTaskId = searchParams.get("taskId");
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const [board, setBoard] = useState<HousekeepingTodayBoard | null>(null);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [units, setUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const currentUserId = profile?.user.id ?? null;

  const eligibleAssignees = useMemo(() => {
    if (!propertyId) return [];
    return members.filter((m) => {
      if (m.status !== "active") return false;
      if (m.role === "admin" || m.propertyIds == null) return true;
      return m.propertyIds.includes(propertyId);
    });
  }, [members, propertyId]);

  const syncParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    if (openCreate) setCreateOpen(true);
  }, [openCreate, filterBookingId, createPresetUnitId]);

  // Deep-link with bookingId forces All Tasks (server-filtered)
  useEffect(() => {
    if (filterBookingId && view !== "all") {
      syncParams({ view: "all", page: "1" });
    }
  }, [filterBookingId, view, syncParams]);

  const effectiveView = filterBookingId ? "all" : view;

  const refresh = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const [membersRes, catalog] = await Promise.all([
        fetchMembers(tenantId),
        fetchPropertyUnitCatalog(tenantId).catch(() => null),
      ]);
      setMembers(membersRes.data.filter((m) => m.status === "active"));
      const propUnits =
        catalog?.properties
          .find((p) => p.id === propertyId)
          ?.units.map((u) => ({ id: u.id, name: u.name })) ?? [];
      setUnits(propUnits);

      if (effectiveView === "today") {
        const today = await fetchHousekeepingToday(tenantId, propertyId);
        setBoard(today);
        setTasks([]);
        setTaskTotal(0);
      } else {
        const assignedToMe =
          filterAssignee === "me" && currentUserId ? currentUserId : undefined;
        const assignedExplicit =
          filterAssignee && filterAssignee !== "me" ? filterAssignee : undefined;
        const listed = await listTasks(tenantId, {
          propertyId,
          status: filterStatus || undefined,
          category: filterCategory || undefined,
          assignedToUserId: assignedToMe ?? assignedExplicit,
          priority: filterPriority || undefined,
          bookingId: filterBookingId || undefined,
          page,
          limit: PAGE_SIZE,
        });
        setTasks(listed.data);
        setTaskTotal(listed.total);
        setBoard(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης καθαριότητας");
      setBoard(null);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [
    tenantId,
    propertyId,
    effectiveView,
    filterStatus,
    filterCategory,
    filterAssignee,
    filterPriority,
    filterBookingId,
    page,
    currentUserId,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!tenantId || !deepTaskId) return;
    let cancelled = false;
    void (async () => {
      try {
        const task = await fetchTask(tenantId, deepTaskId);
        if (cancelled) return;
        setDetailTask(task);
        setDetailOpen(true);
      } catch {
        /* ignore bad deep link */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, deepTaskId, propertyId]);

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (propertyGate) return propertyGate;

  async function runMutation(key: string, fn: () => Promise<void>) {
    setBusyKey(key);
    setFlash(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      const conflict = conflictMessage(err);
      if (conflict) {
        setFlash(conflict);
        await refresh();
        if (detailTask) {
          try {
            const latest = await fetchTask(tenantId!, detailTask.id);
            setDetailTask(latest);
          } catch {
            /* ignore */
          }
        }
      } else {
        setFlash(err instanceof Error ? err.message : "Η ενέργεια απέτυχε");
      }
    } finally {
      setBusyKey(null);
    }
  }

  const needsCleaning =
    board?.units.filter(
      (u) =>
        u.housekeepingStatus === "DIRTY" &&
        u.housekeepingTask?.status !== "IN_PROGRESS",
    ) ?? [];
  const inProgress =
    board?.units.filter((u) => u.housekeepingTask?.status === "IN_PROGRESS") ??
    [];
  const ready = board?.units.filter((u) => u.readyForArrival) ?? [];
  const arrivalAttention =
    board?.units.filter((u) => u.arrivalNeedsClean) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={elNav.housekeeping}
        description={
          property
            ? `${property.name} · ${board?.localToday ?? "…"} · ${board?.propertyTimezone ?? ""}`
            : "Λειτουργίες ενεργού καταλύματος"
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={effectiveView === "today" ? "default" : "outline"}
              size="sm"
              onClick={() => syncParams({ view: "today", page: null, bookingId: null })}
            >
              {elCommon.today}
            </Button>
            <Button
              type="button"
              variant={effectiveView === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => syncParams({ view: "all", page: "1" })}
            >
              Όλες οι εργασίες
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="border border-border/80 bg-surface text-foreground shadow-sm hover:bg-surface-subtle"
              onClick={() => setCreateOpen(true)}
            >
              Δημιουργία εργασίας
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/dashboard/housekeeping/checklist">Λίστα ελέγχου</Link>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/dashboard/housekeeping/history">Ιστορικό καθαρισμών</Link>
            </Button>
          </div>
        }
      />

      {flash ? (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning-foreground"
        >
          {flash}
        </p>
      ) : null}

      {error ? <ErrorState title="Αποτυχία φόρτωσης" message={error} /> : null}

      {tenantId && propertyId ? (
        <CleaningLocationsPanel tenantId={tenantId} propertyId={propertyId} />
      ) : null}

      {loading && !board && tasks.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {effectiveView === "today" && board ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ["Αναχωρήσεις σήμερα", board.summary.departuresToday],
                ["Βρώμικα", board.summary.dirty],
                ["Σε εξέλιξη", board.summary.inProgress],
                ["Έτοιμα για άφιξη", board.summary.readyForArrivals],
                ["Εκπρόθεσμες εργασίες", board.summary.overdueTasks],
              ] as const
            ).map(([label, value]) => (
              <Surface key={label} variant="panel" className="px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="text-xl font-semibold tabular-nums">{value}</p>
              </Surface>
            ))}
          </div>

          {arrivalAttention.length > 0 ? (
            <Surface variant="panel" className="border-warning/50 px-4 py-3">
              <p className="text-sm font-medium text-warning-foreground">
                Άφιξη σήμερα σε βρώμικες μονάδες — καθαρίστε πριν το check-in
              </p>
              <p className="text-xs text-muted-foreground">
                {arrivalAttention.map((u) => u.unitName).join(", ")}
              </p>
            </Surface>
          ) : null}

          <TodaySection
            title="Χρειάζεται καθαρισμός"
            empty="Δεν απαιτείται καθαρισμός αυτή τη στιγμή."
            rows={needsCleaning}
            members={members}
            busyKey={busyKey}
            onStart={(task) =>
              void runMutation(`start:${task.id}`, async () => {
                await mutateTask(tenantId!, task.id, "start", {
                  expectedVersion: task.version,
                });
              })
            }
            onComplete={(task) =>
              void runMutation(`complete:${task.id}`, async () => {
                await mutateTask(tenantId!, task.id, "complete", {
                  expectedVersion: task.version,
                });
              })
            }
            onOpenTask={async (taskId) => {
              const t = await fetchTask(tenantId!, taskId);
              setDetailTask(t);
              setDetailOpen(true);
              syncParams({ taskId });
            }}
          />

          <TodaySection
            title="Σε εξέλιξη"
            empty="Δεν εκτελείται καθαρισμός αυτή τη στιγμή."
            rows={inProgress}
            members={members}
            busyKey={busyKey}
            onStart={() => undefined}
            onComplete={(task) =>
              void runMutation(`complete:${task.id}`, async () => {
                await mutateTask(tenantId!, task.id, "complete", {
                  expectedVersion: task.version,
                });
              })
            }
            onOpenTask={async (taskId) => {
              const t = await fetchTask(tenantId!, taskId);
              setDetailTask(t);
              setDetailOpen(true);
              syncParams({ taskId });
            }}
          />

          <TodaySection
            title="Έτοιμα για άφιξη"
            empty="Δεν υπάρχουν ακόμα έτοιμες αφίξεις."
            rows={ready}
            members={members}
            busyKey={busyKey}
            onStart={() => undefined}
            onComplete={() => undefined}
            onOpenTask={async (taskId) => {
              const t = await fetchTask(tenantId!, taskId);
              setDetailTask(t);
              setDetailOpen(true);
              syncParams({ taskId });
            }}
          />

          {board.overdueTasks.length > 0 ? (
            <Surface>
              <SurfaceHeader title="Εκπρόθεσμες εργασίες" />
              <ul className="divide-y divide-border">
                {board.overdueTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {statusLabelEl(t.status)} · {priorityLabel(t.priority)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void (async () => {
                          const full = await fetchTask(tenantId!, t.id);
                          setDetailTask(full);
                          setDetailOpen(true);
                          syncParams({ taskId: t.id });
                        })()
                      }
                    >
                      {elCommon.open}
                    </Button>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}
        </>
      ) : null}

      {effectiveView === "all" ? (
        <Surface padding="none">
          {filterBookingId ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-subtle/50 px-4 py-2 text-xs">
              <p>
                Φίλτρο κράτησης{" "}
                <Link
                  className="font-medium text-primary underline-offset-2 hover:underline"
                  href={`/dashboard/bookings?bookingId=${encodeURIComponent(filterBookingId)}`}
                >
                  {filterBookingId.slice(0, 8)}…
                </Link>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => syncParams({ bookingId: null })}
              >
                Καθαρισμός φίλτρου κράτησης
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <FilterSelect
              label={elCommon.status}
              value={filterStatus || "all"}
              onChange={(v) =>
                syncParams({ status: v === "all" ? null : v, page: "1" })
              }
              options={[
                ["all", "Όλες οι καταστάσεις"],
                ["OPEN", statusLabelEl("OPEN")],
                ["IN_PROGRESS", statusLabelEl("IN_PROGRESS")],
                ["COMPLETED", statusLabelEl("COMPLETED")],
                ["CANCELLED", statusLabelEl("CANCELLED")],
              ]}
            />
            <FilterSelect
              label="Κατηγορία"
              value={filterCategory || "all"}
              onChange={(v) =>
                syncParams({ category: v === "all" ? null : v, page: "1" })
              }
              options={[
                ["all", "Όλες οι κατηγορίες"],
                ...CATEGORIES.map((c) => [c, taskCategoryLabelEl(c)] as [string, string]),
              ]}
            />
            <FilterSelect
              label="Ανάθεση"
              value={filterAssignee || "all"}
              onChange={(v) =>
                syncParams({ assignee: v === "all" ? null : v, page: "1" })
              }
              options={[
                ["all", "Οποιοσδήποτε"],
                ["me", "Ανατεθειμένες σε εμένα"],
                ...eligibleAssignees.map(
                  (m) =>
                    [m.userId, m.user?.name || m.user?.email || m.userId] as [
                      string,
                      string,
                    ],
                ),
              ]}
            />
            <FilterSelect
              label={elCommon.priority}
              value={filterPriority || "all"}
              onChange={(v) =>
                syncParams({ priority: v === "all" ? null : v, page: "1" })
              }
              options={[
                ["all", "Όλες οι προτεραιότητες"],
                ["NORMAL", priorityLabel("NORMAL")],
                ["HIGH", priorityLabel("HIGH")],
                ["URGENT", priorityLabel("URGENT")],
              ]}
            />
          </div>

          {!loading && tasks.length === 0 ? (
            <EmptyState
              title="Δεν βρέθηκαν εργασίες με αυτά τα φίλτρα."
              description="Δοκιμάστε να καθαρίσετε τα φίλτρα ή δημιουργήστε νέα εργασία."
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Τίτλος</TableHead>
                      <TableHead>Κατηγορία</TableHead>
                      <TableHead>{elCommon.status}</TableHead>
                      <TableHead>{elCommon.priority}</TableHead>
                      <TableHead>Ανάθεση</TableHead>
                      <TableHead className="text-right">{elCommon.actions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell>{taskCategoryLabelEl(t.category)}</TableCell>
                        <TableCell>
                          <StatusBadge
                            status={t.status}
                            label={statusLabelEl(t.status)}
                          />
                        </TableCell>
                        <TableCell>{priorityLabel(t.priority)}</TableCell>
                        <TableCell>
                          {assigneeName(t.assignedToUserId, members)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDetailTask(t);
                              setDetailOpen(true);
                              syncParams({ taskId: t.id });
                            }}
                          >
                            {elCommon.open}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="divide-y divide-border md:hidden">
                {tasks.map((t) => (
                  <li key={t.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {taskCategoryLabelEl(t.category)} ·{" "}
                          {assigneeName(t.assignedToUserId, members)}
                        </p>
                      </div>
                      <StatusBadge
                        status={t.status}
                        label={statusLabelEl(t.status)}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDetailTask(t);
                        setDetailOpen(true);
                        syncParams({ taskId: t.id });
                      }}
                    >
                      Άνοιγμα εργασίας
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border p-3">
                <Pagination
                  page={page}
                  totalPages={Math.max(1, Math.ceil(taskTotal / PAGE_SIZE))}
                  onPageChange={(p) => syncParams({ page: String(p) })}
                />
              </div>
            </>
          )}
        </Surface>
      ) : null}

      <CreateTaskSheet
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o && openCreate) {
            syncParams({ create: null });
          }
        }}
        units={units}
        assignees={eligibleAssignees}
        busy={busyKey === "create"}
        initialUnitId={createPresetUnitId || null}
        initialBookingId={filterBookingId || null}
        onSubmit={(body) =>
          void runMutation("create", async () => {
            const created = await createTask(tenantId!, {
              propertyId: propertyId!,
              ...body,
              bookingId: filterBookingId || body.bookingId || null,
            });
            setCreateOpen(false);
            setDetailTask(created);
            setDetailOpen(true);
            syncParams({
              taskId: created.id,
              view: "all",
              create: null,
              bookingId: filterBookingId || null,
            });
          })
        }
      />

      <TaskDetailSheet
        open={detailOpen}
        task={detailTask}
        members={eligibleAssignees}
        allMembers={members}
        busyKey={busyKey}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) syncParams({ taskId: null });
        }}
        onAction={(action, body) => {
          if (!detailTask) return;
          void runMutation(`${action}:${detailTask.id}`, async () => {
            const updated = await mutateTask(
              tenantId!,
              detailTask.id,
              action,
              body,
            );
            setDetailTask(updated);
          });
        }}
        onMarkUnit={(action, version) => {
          if (!detailTask?.unitId) return;
          void runMutation(`hk:${action}:${detailTask.unitId}`, async () => {
            await markUnitHousekeeping(tenantId!, detailTask.unitId!, action, {
              propertyId: propertyId!,
              expectedVersion: version,
            });
          });
        }}
        housekeepingVersion={
          board?.units.find((u) => u.unitId === detailTask?.unitId)
            ?.housekeepingVersion
        }
        housekeepingStatus={
          board?.units.find((u) => u.unitId === detailTask?.unitId)
            ?.housekeepingStatus
        }
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="min-w-[140px] space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TodaySection({
  title,
  empty,
  rows,
  members,
  busyKey,
  onStart,
  onComplete,
  onOpenTask,
}: {
  title: string;
  empty: string;
  rows: HousekeepingTodayBoard["units"];
  members: MemberRecord[];
  busyKey: string | null;
  onStart: (task: NonNullable<HousekeepingTodayBoard["units"][0]["housekeepingTask"]>) => void;
  onComplete: (task: NonNullable<HousekeepingTodayBoard["units"][0]["housekeepingTask"]>) => void;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <Surface>
      <SurfaceHeader title={title} />
      {rows.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState title={empty} description="Δεν υπάρχει ουρά σε αυτή τη στήλη." compact />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const task = row.housekeepingTask;
            return (
              <li
                key={row.unitId}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold">{row.unitName}</p>
                    <StatusBadge
                      status={row.housekeepingStatus}
                      label={row.housekeepingStatus === "CLEAN" ? statusLabelEl("CLEAN") : statusLabelEl("DIRTY")}
                    />
                    {row.readyForArrival ? (
                      <StatusBadge status="COMPLETED" label="Έτοιμο για άφιξη" />
                    ) : null}
                    {task ? (
                      <StatusBadge
                        status={task.status}
                        label={statusLabelEl(task.status)}
                      />
                    ) : row.housekeepingStatus === "DIRTY" ? (
                      <span className="text-xs text-muted-foreground">
                        Δεν υπάρχει ανοιχτή εργασία καθαριότητας
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.departing
                      ? `Αναχώρηση · ${row.departing.guestName}`
                      : null}
                    {row.departing && row.arriving ? " · " : null}
                    {row.arriving ? `Άφιξη · ${row.arriving.guestName}` : null}
                    {!row.departing && !row.arriving ? "Καμία κίνηση διαμονής σήμερα" : null}
                  </p>
                  {task ? (
                    <p className="text-xs text-muted-foreground">
                      {task.title} · {assigneeName(task.assignedToUserId, members)}
                      {task.priority !== "NORMAL"
                        ? ` · ${priorityLabel(task.priority)}`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {task?.status === "OPEN" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-10 min-w-[5.5rem]"
                      disabled={busyKey === `start:${task.id}`}
                      onClick={() => onStart(task)}
                    >
                      Έναρξη
                    </Button>
                  ) : null}
                  {task?.status === "IN_PROGRESS" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-10 min-w-[5.5rem]"
                      disabled={busyKey === `complete:${task.id}`}
                      onClick={() => onComplete(task)}
                    >
                      Ολοκλήρωση
                    </Button>
                  ) : null}
                  {task ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenTask(task.id)}
                    >
                      {elCommon.details}
                    </Button>
                  ) : null}
                  {row.departing ? (
                    <Button type="button" size="sm" variant="ghost" asChild>
                      <Link href={`/dashboard/bookings?bookingId=${row.departing.bookingId}`}>
                        {elCommon.booking}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}

function CreateTaskSheet({
  open,
  onOpenChange,
  units,
  assignees,
  busy,
  initialUnitId,
  initialBookingId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  units: Array<{ id: string; name: string }>;
  assignees: MemberRecord[];
  busy: boolean;
  initialUnitId?: string | null;
  initialBookingId?: string | null;
  onSubmit: (body: {
    category: TaskCategory;
    title: string;
    description?: string | null;
    unitId?: string | null;
    bookingId?: string | null;
    assignedToUserId?: string | null;
    dueAt?: string | null;
    priority?: TaskPriority;
  }) => void;
}) {
  const [category, setCategory] = useState<TaskCategory>("HOUSEKEEPING");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unitId, setUnitId] = useState<string>("none");
  const [assignee, setAssignee] = useState<string>("none");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [dueAt, setDueAt] = useState("");

  useEffect(() => {
    if (!open) return;
    setCategory("HOUSEKEEPING");
    setTitle("");
    setDescription("");
    setUnitId(initialUnitId && units.some((u) => u.id === initialUnitId) ? initialUnitId : "none");
    setAssignee("none");
    setPriority("NORMAL");
    setDueAt("");
  }, [open, initialUnitId, units]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Δημιουργία εργασίας</SheetTitle>
          <SheetDescription>
            Το κατάλυμα προέρχεται από το ενεργό κατάλυμα. Προεπιλογή: ανοιχτή / κανονική προτεραιότητα.
            {initialBookingId
              ? " Συνδέεται με την τρέχουσα κράτηση."
              : ""}
          </SheetDescription>
        </SheetHeader>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onSubmit({
              category,
              title: title.trim(),
              description: description.trim() || null,
              unitId: unitId === "none" ? null : unitId,
              bookingId: initialBookingId ?? null,
              assignedToUserId: assignee === "none" ? null : assignee,
              priority,
              dueAt: dueAt ? new Date(dueAt).toISOString() : null,
            });
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="hk-cat">Κατηγορία</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as TaskCategory)}
            >
              <SelectTrigger id="hk-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {taskCategoryLabelEl(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hk-title">Τίτλος</Label>
            <Input
              id="hk-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={255}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hk-desc">{elCommon.description}</Label>
            <Textarea
              id="hk-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hk-unit">{elCommon.unit}</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger id="hk-unit">
                <SelectValue placeholder={elCommon.optional} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Χωρίς μονάδα</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hk-assignee">Ανάθεση</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="hk-assignee">
                <SelectValue placeholder="Χωρίς ανάθεση" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Χωρίς ανάθεση</SelectItem>
                {assignees.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.user?.name || m.user?.email || m.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hk-priority">{elCommon.priority}</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as TaskPriority)}
            >
              <SelectTrigger id="hk-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">{priorityLabel("NORMAL")}</SelectItem>
                <SelectItem value="HIGH">{priorityLabel("HIGH")}</SelectItem>
                <SelectItem value="URGENT">{priorityLabel("URGENT")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="hk-due">Προθεσμία</Label>
            <Input
              id="hk-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || !title.trim()}>
            Δημιουργία εργασίας
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailSheet({
  open,
  task,
  members,
  allMembers,
  busyKey,
  onOpenChange,
  onAction,
  onMarkUnit,
  housekeepingVersion,
  housekeepingStatus,
}: {
  open: boolean;
  task: TaskRecord | null;
  members: MemberRecord[];
  allMembers: MemberRecord[];
  busyKey: string | null;
  onOpenChange: (o: boolean) => void;
  onAction: (
    action: "start" | "unstart" | "complete" | "cancel" | "reopen" | "assign",
    body: Record<string, unknown>,
  ) => void;
  onMarkUnit: (action: "dirty" | "clean", version?: number) => void;
  housekeepingVersion?: number;
  housekeepingStatus?: "CLEAN" | "DIRTY";
}) {
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("none");

  useEffect(() => {
    if (!task) return;
    setNote("");
    setAssignee(task.assignedToUserId ?? "none");
  }, [task]);

  if (!task) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{task.title}</SheetTitle>
          <SheetDescription>
            {taskCategoryLabelEl(task.category)} · v{task.version}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={task.status} label={statusLabelEl(task.status)} />
            <StatusBadge status={task.priority} label={priorityLabel(task.priority)} />
          </div>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Ανάθεση</dt>
              <dd>{assigneeName(task.assignedToUserId, allMembers)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Προθεσμία</dt>
              <dd>
                {task.dueAt ? new Date(task.dueAt).toLocaleString() : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{elCommon.description}</dt>
              <dd className="whitespace-pre-wrap">{task.description || "—"}</dd>
            </div>
            {task.completionNote ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Σημείωση ολοκλήρωσης</dt>
                <dd>{task.completionNote}</dd>
              </div>
            ) : null}
          </dl>

          {task.bookingId ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href={`/dashboard/bookings?bookingId=${task.bookingId}`}>
                Άνοιγμα κράτησης
              </Link>
            </Button>
          ) : null}

          <div className="space-y-2 rounded-md border border-border p-3">
            <Label htmlFor="hk-assign">Ανάθεση</Label>
            <div className="flex gap-2">
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id="hk-assign" className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Χωρίς ανάθεση</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.user?.name || m.user?.email || m.userId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={busyKey?.startsWith("assign:")}
                onClick={() =>
                  onAction("assign", {
                    expectedVersion: task.version,
                    assignedToUserId: assignee === "none" ? null : assignee,
                  })
                }
              >
                {elCommon.save}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {task.status === "OPEN" ? (
              <Button
                type="button"
                className="min-h-10"
                disabled={busyKey === `start:${task.id}`}
                onClick={() =>
                  onAction("start", { expectedVersion: task.version })
                }
              >
                Έναρξη
              </Button>
            ) : null}
            {task.status === "IN_PROGRESS" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10"
                  disabled={busyKey === `unstart:${task.id}`}
                  onClick={() =>
                    onAction("unstart", { expectedVersion: task.version })
                  }
                >
                  Αναίρεση έναρξης
                </Button>
                <div className="w-full space-y-1">
                  <Label htmlFor="hk-note">Σημείωση ολοκλήρωσης</Label>
                  <Input
                    id="hk-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  className="min-h-10"
                  disabled={busyKey === `complete:${task.id}`}
                  onClick={() =>
                    onAction("complete", {
                      expectedVersion: task.version,
                      completionNote: note || null,
                    })
                  }
                >
                  Ολοκλήρωση
                </Button>
              </>
            ) : null}
            {task.status === "OPEN" || task.status === "IN_PROGRESS" ? (
              <Button
                type="button"
                variant="destructive"
                className="min-h-10"
                disabled={busyKey === `cancel:${task.id}`}
                onClick={() =>
                  onAction("cancel", { expectedVersion: task.version })
                }
              >
                {elCommon.cancel}
              </Button>
            ) : null}
            {task.status === "COMPLETED" ? (
              <Button
                type="button"
                className="min-h-10"
                disabled={busyKey === `reopen:${task.id}`}
                onClick={() =>
                  onAction("reopen", { expectedVersion: task.version })
                }
              >
                Επανάνοιγμα
              </Button>
            ) : null}
          </div>

          {task.unitId ? (
            <div className={cn("space-y-2 border-t border-border pt-3")}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Κατάσταση μονάδας
              </p>
              <p className="text-sm">
                {elCommon.status}:{" "}
                {housekeepingStatus === "DIRTY"
                  ? statusLabelEl("DIRTY")
                  : housekeepingStatus === "CLEAN"
                    ? statusLabelEl("CLEAN")
                    : "Άγνωστο"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyKey?.startsWith("hk:dirty")}
                  onClick={() => onMarkUnit("dirty", housekeepingVersion)}
                >
                  Σήμανση ως βρώμικο
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyKey?.startsWith("hk:clean")}
                  onClick={() => onMarkUnit("clean", housekeepingVersion)}
                >
                  Σήμανση ως καθαρό
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Η σήμανση ως καθαρό δεν ολοκληρώνει ανοιχτή εργασία καθαριότητας.
              </p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
