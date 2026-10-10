"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTenant } from "@/hooks/use-tenant";
import { fetchBookingCommercialAmendments } from "@/lib/admin/api";
import type { CommercialAmendmentRecord } from "@/lib/admin/types";
import { formatMoney } from "@/lib/admin/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WorkspaceDetailList,
  WorkspaceDetailRow,
  WorkspaceSection,
} from "@/features/workspace/components/WorkspaceSection";

export interface BookingCommercialAmendmentsSectionProps {
  bookingId: string;
  /** Bump to reload after a successful financial reprice. */
  refreshNonce?: number;
  active?: boolean;
}

function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  try {
    return new Intl.DateTimeFormat("el-GR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(ms));
  } catch {
    return iso;
  }
}

function formatSignedDelta(amount: string, currency: string): string {
  const n = Number.parseFloat(amount);
  if (Number.isNaN(n)) return formatMoney(amount, currency);
  const formatted = formatMoney(Math.abs(n).toFixed(4), currency);
  if (n > 0) return `+${formatted}`;
  if (n < 0) return `−${formatted}`;
  return formatted;
}

function safeActorLabel(actorId: string): string {
  const trimmed = actorId.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= 12) return trimmed;
  return `…${trimmed.slice(-8)}`;
}

/**
 * Read-only commercial amendment history (BFS-4).
 * Never renders confirmation tokens or idempotency keys.
 */
export function BookingCommercialAmendmentsSection({
  bookingId,
  refreshNonce = 0,
  active = true,
}: BookingCommercialAmendmentsSectionProps) {
  const { tenantId } = useTenant();
  const [items, setItems] = useState<CommercialAmendmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!tenantId || !bookingId || !active) return;
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBookingCommercialAmendments(tenantId, bookingId);
      if (requestId !== loadRequestIdRef.current) return;
      setItems(rows);
    } catch (err) {
      if (requestId !== loadRequestIdRef.current) return;
      setItems([]);
      setError(
        err instanceof Error
          ? err.message
          : "Αποτυχία φόρτωσης ιστορικού προσαρμογών",
      );
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [tenantId, bookingId, active]);

  useEffect(() => {
    loadRequestIdRef.current += 1;
    setItems([]);
    setError(null);
    void load();
  }, [load, refreshNonce]);

  return (
    <WorkspaceSection title="Ιστορικό προσαρμογών τιμής">
      {loading && items.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Δεν υπάρχουν καταγεγραμμένες προσαρμογές συμφωνημένης τιμής.
        </p>
      ) : null}

      <div className="space-y-3">
        {items.map((row) => (
          <article
            key={row.id}
            className="space-y-2 rounded-md border border-border px-3 py-2"
            data-testid="commercial-amendment-row"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-foreground">
                {formatWhen(row.createdAt)}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatSignedDelta(row.deltaAmount, row.currency)}
              </p>
            </div>
            <WorkspaceDetailList>
              <WorkspaceDetailRow
                label="Προηγούμενο σύνολο"
                value={formatMoney(row.previousTotalAmount, row.currency)}
              />
              <WorkspaceDetailRow
                label="Νέο σύνολο"
                value={formatMoney(row.newTotalAmount, row.currency)}
                bold
              />
              <WorkspaceDetailRow label="Λόγος" value={row.reason} />
              <WorkspaceDetailRow
                label="Χειριστής"
                value={safeActorLabel(row.actorId)}
                mono
              />
            </WorkspaceDetailList>
          </article>
        ))}
      </div>
    </WorkspaceSection>
  );
}
