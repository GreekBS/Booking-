"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { fetchAllProperties } from "@/lib/admin/api";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  disconnectChannelConnection,
  pauseChannelConnection,
  resumeChannelConnection,
} from "../channel-api";
import {
  fetchBookingComOperatorView,
  formatBookingComApiError,
  reconcileBookingComConnection,
} from "./booking-com-api";
import { ContextualHelpLink } from "./ContextualHelpLink";
import type { BookingComOperatorView } from "./types";

type Props = { connectionId: string };

function friendlyIssue(connection: BookingComOperatorView): string[] {
  const messages: string[] = [];
  if (connection.connection.lastError) {
    messages.push("Booking.com connection needs attention.");
  }
  if (!connection.counts.propertyMapped) {
    messages.push("Property is not mapped.");
  }
  if (connection.counts.roomsMapped === 0) {
    messages.push("1 or more rooms still need mapping.");
  }
  for (const run of connection.reconciliation.slice(0, 3)) {
    if (run.outcome === "MAPPING_DRIFT") {
      messages.push("1 room or rate is no longer mapped cleanly.");
    }
    if (run.outcome === "PROVIDER_UNAVAILABLE") {
      messages.push("Booking.com could not be reached.");
    }
    if (run.outcome === "REMOTE_DRIFT" || run.outcome === "LOCAL_AHEAD") {
      messages.push(
        run.autoHealEnqueued
          ? "Availability synchronization found differences. Talos queued a retry."
          : "Availability synchronization needs review.",
      );
    }
    if (run.outcome === "MISSING_RESERVATION") {
      messages.push("A reservation requires manual review.");
    }
  }
  if (messages.length === 0 && connection.phase === "connected") {
    messages.push("Connection looks healthy.");
  }
  return [...new Set(messages)];
}

export function BookingComConnectedDashboard({ connectionId }: Props) {
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const [view, setView] = useState<BookingComOperatorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [catalog, setCatalog] = useState<{
    activeUnitIds: string[];
    activeRatePlanIds: string[];
    unitPropertyIds: Record<string, string>;
  }>({ activeUnitIds: [], activeRatePlanIds: [], unitPropertyIds: {} });

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [operatorView, props] = await Promise.all([
        fetchBookingComOperatorView(tenantId, connectionId),
        fetchAllProperties(tenantId),
      ]);
      setView(operatorView);
      const unitPropertyIds: Record<string, string> = {};
      const activeUnitIds: string[] = [];
      for (const p of props.data ?? []) {
        for (const u of p.units) {
          activeUnitIds.push(u.id);
          unitPropertyIds[u.id] = p.id;
        }
      }
      setCatalog({
        activeUnitIds,
        activeRatePlanIds: activeUnitIds.map((id) => `rp-${id}`),
        unitPropertyIds,
      });
    } catch (err) {
      setError(formatBookingComApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId, connectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const issues = useMemo(() => (view ? friendlyIssue(view) : []), [view]);

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !view) {
    return <ErrorState message={error ?? "Unavailable"} onRetry={() => void load()} />;
  }

  const version = view.connection.semanticConfigVersion;
  const from = new Date().toISOString().slice(0, 10);
  const toDate = new Date();
  toDate.setUTCDate(toDate.getUTCDate() + 7);
  const to = toDate.toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <PageHeader
        title={view.connection.displayName}
        description="Booking.com operational dashboard"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/channels">Channels</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/channels/${connectionId}/setup`}>Manage mappings</Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge>{view.phaseLabel}</Badge>
        <span className="text-sm text-muted-foreground">Booking.com</span>
        <ContextualHelpLink anchor="health" label="Health guide" />
      </div>

      <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" role="status">
        {view.partnerAccess.operatorMessage}
      </p>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="text-sm text-emerald-800" role="status">
          {actionMessage}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              Status:{" "}
              <span className="capitalize">
                {view.connection.status.replace(/_/g, " ")}
              </span>
            </p>
            <p>Hotel ID: {view.setup?.hotelId ?? "—"}</p>
            <p>Property mapped: {view.counts.propertyMapped ? "Yes" : "No"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mappings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Rooms mapped: {view.counts.roomsMapped}</p>
            <p>Rate plans mapped: {view.counts.ratesMapped}</p>
            <p>Roomrates mapped: {view.counts.roomratesMapped}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reservations</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Health follows Booking.com → Talos receive path. Live retrieval requires partner
              access.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Availability &amp; rates</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Outbound ARI uses the durable push pipeline. Failures retry automatically where
              safe.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Issues requiring attention</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {issues.map((msg) => (
            <p key={msg} className="text-sm">
              {msg}
            </p>
          ))}
          {view.reconciliation[0] ? (
            <p className="text-xs text-muted-foreground">
              Last reconciliation: {view.reconciliation[0].scope} /{" "}
              {view.reconciliation[0].outcome} @{" "}
              {new Date(view.reconciliation[0].completedAt).toLocaleString()}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No reconciliation runs yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void (async () => {
              setBusy(true);
              setActionError(null);
              try {
                const result = await reconcileBookingComConnection(
                  tenantId!,
                  connectionId,
                  { from, to, ...catalog },
                );
                if (!result.available) {
                  setActionMessage(result.message ?? view.partnerAccess.operatorMessage);
                } else {
                  setActionMessage("Reconciliation completed.");
                  await load();
                }
              } catch (err) {
                setActionError(formatBookingComApiError(err));
              } finally {
                setBusy(false);
              }
            })()
          }
        >
          Reconcile
        </Button>
        {view.connection.status === "active" ? (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  await pauseChannelConnection(tenantId!, connectionId, version);
                  setActionMessage("Connection paused.");
                  await load();
                } catch (err) {
                  setActionError(formatBookingComApiError(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Pause
          </Button>
        ) : null}
        {view.connection.status === "paused" ? (
          <Button
            disabled={busy}
            onClick={() =>
              void (async () => {
                setBusy(true);
                try {
                  await resumeChannelConnection(tenantId!, connectionId, version);
                  setActionMessage("Connection resumed.");
                  await load();
                } catch (err) {
                  setActionError(formatBookingComApiError(err));
                } finally {
                  setBusy(false);
                }
              })()
            }
          >
            Resume
          </Button>
        ) : null}
        <Button
          variant="destructive"
          disabled={busy || view.connection.status === "disconnected"}
          onClick={() => setConfirmDisconnect(true)}
        >
          Disconnect
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/channels/help/booking-com">Help Center</Link>
        </Button>
      </div>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Booking.com?</AlertDialogTitle>
            <AlertDialogDescription>
              This ends the live channel link and stops sync. Booking history, external
              reservation links, audit evidence, and reconciliation history are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    await disconnectChannelConnection(tenantId!, connectionId, version);
                    setActionMessage("Connection disconnected.");
                    setConfirmDisconnect(false);
                    await load();
                  } catch (err) {
                    setActionError(formatBookingComApiError(err));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
