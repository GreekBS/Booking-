"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import { createQuoteFromHold, fetchHoldDetail, releaseHold } from "@/lib/admin/api";
import { nightsBetween } from "@/lib/admin/utils";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  DrawerDetailList,
  DrawerDetailRow,
  DrawerDivider,
  DrawerSection,
} from "@/features/availability/components/drawers/DrawerPrimitives";
import { useWorkspace } from "@/features/workspace/context/WorkspaceContext";
import { useCalendarActions } from "../../context/CalendarActionsContext";
import type { WorkspaceHoldTarget } from "../../types";
import { WorkspacePanelActions } from "./WorkspacePanelActions";

function formatCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface HoldWorkspacePanelProps {
  target: WorkspaceHoldTarget;
  active: boolean;
}

export function HoldWorkspacePanel({ target, active }: HoldWorkspacePanelProps) {
  const router = useRouter();
  const { tenantId } = useTenant();
  const { closeWorkspace } = useWorkspace();
  const { refreshCalendars } = useCalendarActions();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchHoldDetail>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!active || !tenantId) {
      setDetail(null);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const fresh = await fetchHoldDetail(tenantId!, target.id);
        setDetail(fresh);
      } catch {
        setDetail(null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [active, target.id, tenantId]);

  const data = detail;

  useEffect(() => {
    if (!active || !data?.expiresAt) {
      setCountdown("");
      return;
    }
    setCountdown(formatCountdown(data.expiresAt));
    const id = window.setInterval(() => {
      setCountdown(formatCountdown(data.expiresAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, data?.expiresAt]);

  const holdSource = useMemo(() => {
    if (!data?.sessionRef) return "Storefront session";
    return data.sessionRef;
  }, [data?.sessionRef]);

  async function handleRelease() {
    if (!tenantId || !data) return;
    setActionLoading(true);
    try {
      await releaseHold(tenantId, data.id);
      toastSuccess("Hold released");
      refreshCalendars();
      closeWorkspace();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to release hold");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConvert() {
    if (!tenantId || !data) return;
    setActionLoading(true);
    try {
      await createQuoteFromHold(tenantId, data.id);
      toastSuccess("Quote created — continue in New Booking");
      closeWorkspace();
      router.push("/dashboard/bookings/new");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create quote");
    } finally {
      setActionLoading(false);
    }
  }

  if (!active) return null;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Hold unavailable.</p>;
  }

  return (
    <>
      <div className="space-y-6 pb-2 text-sm">
        <div>
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden />
            <h3 className="text-sm font-semibold">Active hold</h3>
            <StatusBadge status={data.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{target.unitName}</p>
        </div>

        <DrawerSection title="Time remaining">
          <p className="font-mono text-xl font-semibold tabular-nums text-[#111827] dark:text-foreground">
            {countdown || "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Expires {new Date(data.expiresAt).toLocaleString()}
          </p>
        </DrawerSection>

        <DrawerSection title="Stay">
          <DrawerDetailList>
            <DrawerDetailRow label="Arrival" value={data.checkIn} />
            <DrawerDetailRow label="Departure" value={data.checkOut} />
            <DrawerDetailRow
              label="Nights"
              value={String(nightsBetween(data.checkIn, data.checkOut))}
            />
            <DrawerDetailRow
              label="Guests"
              value={data.guestCount > 0 ? String(data.guestCount) : "—"}
            />
          </DrawerDetailList>
        </DrawerSection>

        <DrawerDivider />

        <DrawerSection title="Location">
          <DrawerDetailList>
            <DrawerDetailRow label="Property" value={target.propertyName} />
            <DrawerDetailRow label="Unit" value={target.unitName} />
          </DrawerDetailList>
        </DrawerSection>

        <DrawerDivider />

        <DrawerSection title="Reference">
          <DrawerDetailList>
            <DrawerDetailRow label="Hold ID" value={data.id.slice(0, 12)} mono />
            <DrawerDetailRow label="Quote ref" value={data.sessionRef ?? "—"} mono />
            <DrawerDetailRow label="Source" value={holdSource} />
          </DrawerDetailList>
        </DrawerSection>
      </div>

      <WorkspacePanelActions>
        <Button
          size="sm"
          variant="destructive"
          disabled={actionLoading || data.status !== "active"}
          onClick={() => void handleRelease()}
        >
          Release hold
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={actionLoading || data.status !== "active"}
          onClick={() => void handleConvert()}
        >
          Convert to booking
        </Button>
        <Button size="sm" variant="ghost" onClick={closeWorkspace}>
          Close
        </Button>
      </WorkspacePanelActions>
    </>
  );
}
