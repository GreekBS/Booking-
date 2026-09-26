"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  createQuoteFromHold,
  fetchHoldDetail,
  releaseHold,
} from "@/lib/admin/api";
import type { HoldRecord } from "@/lib/admin/types";
import { nightsBetween } from "@/lib/admin/utils";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  DrawerActions,
  DrawerDetailList,
  DrawerDetailRow,
  DrawerDivider,
  DrawerSection,
} from "./DrawerPrimitives";

interface HoldDetailDrawerProps {
  hold: HoldRecord | null;
  unitLabel?: string;
  propertyLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReleased: () => void;
}

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

export function HoldDetailDrawer({
  hold,
  unitLabel,
  propertyLabel,
  open,
  onOpenChange,
  onReleased,
}: HoldDetailDrawerProps) {
  const router = useRouter();
  const { tenantId } = useTenant();
  const [detail, setDetail] = useState<HoldRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!open || !hold || !tenantId) {
      setDetail(null);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const fresh = await fetchHoldDetail(tenantId!, hold!.id);
        setDetail(fresh);
      } catch {
        setDetail(hold);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [open, hold, tenantId]);

  const data = detail ?? hold;

  useEffect(() => {
    if (!open || !data?.expiresAt) {
      setCountdown("");
      return;
    }
    setCountdown(formatCountdown(data.expiresAt));
    const id = window.setInterval(() => {
      setCountdown(formatCountdown(data.expiresAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, data?.expiresAt]);

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
      onReleased();
      onOpenChange(false);
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
      const quote = await createQuoteFromHold(tenantId, data.id);
      toastSuccess("Quote created — continue in New Booking");
      onOpenChange(false);
      router.push(
        `/dashboard/bookings/new?quoteId=${encodeURIComponent(quote.id)}`,
      );
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Failed to create quote");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-md">
        {!data ? null : loading ? (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3 text-left">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-amber-500/60 bg-amber-500/10">
                  <Timer className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-lg">Active hold</SheetTitle>
                  <SheetDescription className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge status={data.status} />
                    {unitLabel && <span>{unitLabel}</span>}
                  </SheetDescription>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800/80 dark:text-amber-200/80">
                  Time remaining
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                  {countdown || "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Expires {new Date(data.expiresAt).toLocaleString()}
                </p>
              </div>
            </SheetHeader>

            <div className="mt-6 flex-1 space-y-5 pb-24 text-sm">
              <DrawerSection title="Stay">
                <DrawerDetailList>
                  <DrawerDetailRow
                    label="Arrival"
                    value={data.checkIn}
                  />
                  <DrawerDetailRow
                    label="Departure"
                    value={data.checkOut}
                  />
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
                  <DrawerDetailRow label="Property" value={propertyLabel ?? "—"} />
                  <DrawerDetailRow label="Unit" value={unitLabel ?? "—"} />
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

            <DrawerActions>
              <Button
                variant="destructive"
                disabled={actionLoading || data.status !== "active"}
                onClick={() => void handleRelease()}
              >
                Release hold
              </Button>
              <Button
                variant="secondary"
                disabled={actionLoading || data.status !== "active"}
                onClick={() => void handleConvert()}
              >
                Convert to booking
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/bookings/new">New booking</Link>
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DrawerActions>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
