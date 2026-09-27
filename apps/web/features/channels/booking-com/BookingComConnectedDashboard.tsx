"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { fetchAllProperties } from "@/lib/admin/api";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
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
import { channelStatusLabel } from "@/lib/admin/operator-labels";
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
import { elCommon, elNav } from "@/lib/i18n";

type Props = { connectionId: string };

const RECONCILE_OUTCOME_LABEL: Record<string, string> = {
  MAPPING_DRIFT: "Απαιτείται έλεγος αντιστοίχισης",
  PROVIDER_UNAVAILABLE: "Το Booking.com δεν είναι διαθέσιμο",
  REMOTE_DRIFT: "Βρέθηκαν διαφορές διαθεσιμότητας",
  LOCAL_AHEAD: "Τοπικό απόθεμα μπροστά",
  MISSING_RESERVATION: "Απαιτείται έλεγος κράτησης",
  OK: "Σε συγχρονισμό",
  HEALTHY: "Υγιές",
};

function reconcileOutcomeLabel(outcome: string): string {
  return RECONCILE_OUTCOME_LABEL[outcome] ?? outcome.replace(/_/g, " ").toLowerCase();
}

function friendlyIssue(connection: BookingComOperatorView): string[] {
  const messages: string[] = [];
  if (connection.connection.lastError) {
    messages.push("Η σύνδεση Booking.com χρειάζεται προσοχή.");
  }
  if (!connection.counts.propertyMapped) {
    messages.push("Το κατάλυμα δεν είναι αντιστοιχισμένο.");
  }
  if (connection.counts.roomsMapped === 0) {
    messages.push("Ένα ή περισσότερα δωμάτια χρειάζονται ακόμα αντιστοίχιση.");
  }
  for (const run of connection.reconciliation.slice(0, 3)) {
    if (run.outcome === "MAPPING_DRIFT") {
      messages.push("Ένα δωμάτιο ή τιμοκατάλογος δεν αντιστοιχίζεται πλέον σωστά.");
    }
    if (run.outcome === "PROVIDER_UNAVAILABLE") {
      messages.push("Δεν ήταν δυνατή η επικοινωνία με το Booking.com.");
    }
    if (run.outcome === "REMOTE_DRIFT" || run.outcome === "LOCAL_AHEAD") {
      messages.push(
        run.autoHealEnqueued
          ? "Ο συγχρονισμός διαθεσιμότητας βρήκε διαφορές. Το Talos έθεσε επανάληψη στην ουρά."
          : "Ο συγχρονισμός διαθεσιμότητας χρειάζεται έλεγο.",
      );
    }
    if (run.outcome === "MISSING_RESERVATION") {
      messages.push("Μια κράτηση απαιτεί χειροκίνητο έλεγο.");
    }
  }
  if (messages.length === 0 && connection.phase === "connected") {
    messages.push("Δεν αναφέρονται ανοιχτά θέματα.");
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
    return <ErrorState message={error ?? "Μη διαθέσιμο"} onRetry={() => void load()} />;
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
        description="Booking.com — κρατήσεις εισερχόμενες, διαθεσιμότητα και τιμές εξερχόμενες."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={view.connection.status}
              label={view.phaseLabel || channelStatusLabel(view.connection.status)}
            />
            <span className="text-xs text-muted-foreground">Booking.com</span>
            <ContextualHelpLink anchor="health" label="Οδηγός υγείας" />
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/channels">{elNav.channels}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/dashboard/channels/${connectionId}/setup`}>Διαχείριση αντιστοιχίσεων</Link>
            </Button>
          </div>
        }
      />

      <p
        className="rounded-md border border-border bg-surface-subtle/50 px-3 py-2 text-sm text-muted-foreground"
        role="status"
      >
        {view.partnerAccess.operatorMessage}
      </p>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionMessage ? (
        <p className="text-sm text-success" role="status">
          {actionMessage}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Surface>
          <SurfaceHeader title="Σύνδεση" />
          <div className="space-y-1 text-sm">
            <p>
              {elCommon.status}:{" "}
              <span className="capitalize">
                {channelStatusLabel(view.connection.status)}
              </span>
            </p>
            <p>Hotel ID: {view.setup?.hotelId ?? "—"}</p>
            <p>Κατάλυμα αντιστοιχισμένο: {view.counts.propertyMapped ? elCommon.yes : elCommon.no}</p>
          </div>
        </Surface>
        <Surface>
          <SurfaceHeader title="Αντιστοίχιση καταλύματος / καταχώρησης" />
          <div className="space-y-1 text-sm">
            <p>Δωμάτια αντιστοιχισμένα: {view.counts.roomsMapped}</p>
            <p>Τιμοκατάλογοι αντιστοιχισμένοι: {view.counts.ratesMapped}</p>
            <p>Σύνδεσμοι δωματίου–τιμής: {view.counts.roomratesMapped}</p>
          </div>
        </Surface>
        <Surface>
          <SurfaceHeader title="Κρατήσεις" />
          <p className="text-sm text-muted-foreground">
            Η υγεία ακολουθεί τη διαδρομή λήψης Booking.com → Talos. Η ζωντανή ανάκτηση
            απαιτεί πρόσβαση συνεργάτη.
          </p>
        </Surface>
        <Surface>
          <SurfaceHeader title="Συγχρονισμός αποθέματος" />
          <p className="text-sm text-muted-foreground">
            Η διαθεσιμότητα και οι τιμές χρησιμοποιούν την ανθεκτική εξερχόμενη ροή. Τα
            σφάλματα επαναλαμβάνονται αυτόματα όπου είναι ασφαλές.
          </p>
        </Surface>
      </div>

      <Surface>
        <SurfaceHeader title="Κατάσταση" description="Θέματα που χρειάζονται προσοχή" />
        <div className="space-y-2">
          {issues.map((msg) => (
            <p key={msg} className="text-sm">
              {msg}
            </p>
          ))}
          {view.reconciliation[0] ? (
            <p className="text-xs text-muted-foreground">
              Τελευταίος έλεγχος: {reconcileOutcomeLabel(view.reconciliation[0].outcome)} ·{" "}
              {new Date(view.reconciliation[0].completedAt).toLocaleString()}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Δεν έχουν εκτελεστεί ακόμα συμφιλιώσεις.</p>
          )}
        </div>
      </Surface>

      <Surface>
        <SurfaceHeader title="Ενέργειες" />
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
                    setActionMessage("Η συμφοίωση ολοκληρώθηκε.");
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
            Συμφοίωση
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
                    setActionMessage("Η σύνδεση τέθηκε σε παύση.");
                    await load();
                  } catch (err) {
                    setActionError(formatBookingComApiError(err));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              Παύση
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
                    setActionMessage("Η σύνδεση συνεχίστηκε.");
                    await load();
                  } catch (err) {
                    setActionError(formatBookingComApiError(err));
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              Συνέχιση
            </Button>
          ) : null}
          <Button
            variant="destructive"
            disabled={busy || view.connection.status === "disconnected"}
            onClick={() => setConfirmDisconnect(true)}
          >
            Αποσύνδεση
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/channels/help/booking-com">Βοήθεια</Link>
          </Button>
        </div>
      </Surface>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Αποσύνδεση Booking.com;</AlertDialogTitle>
            <AlertDialogDescription>
              Τερματίζει τη ζωντανή σύνδεση καναλιού και σταματά τον συγχρονισμό. Διατηρούνται
              ιστορικό κρατήσεων, εξωτερικοί σύνδεσμοι κρατήσεων, στοιχεία ελέγχου και ιστορικό
              συμφιλιώσεων.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ακύρωση</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  try {
                    await disconnectChannelConnection(tenantId!, connectionId, version);
                    setActionMessage("Η σύνδεση αποσυνδέθηκε.");
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
              Αποσύνδεση
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
