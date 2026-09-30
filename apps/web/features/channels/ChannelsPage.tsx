"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { PageHeader } from "@/components/admin/page-header";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  channelProviderLabel,
  channelStatusLabel,
} from "@/lib/admin/operator-labels";
import { elCommon } from "@/lib/i18n";
import {
  createIcalConnection,
  formatChannelApiError,
  listChannelConnections,
} from "./channel-api";
import type { OperatorChannelConnection } from "./types";
import {
  BookingComProviderCard,
  ComingSoonProviderCard,
} from "./booking-com/BookingComProviderCard";
import {
  beginBookingComSetup,
  fetchBookingComCapabilities,
  formatBookingComApiError,
} from "./booking-com/booking-com-api";
import type { BookingComCapabilities } from "./booking-com/types";

function connectionHref(c: OperatorChannelConnection): string {
  if (
    c.provider === "booking_com" &&
    (c.status === "draft" || c.status === "pending_auth")
  ) {
    return `/dashboard/channels/${c.connectionId}/setup`;
  }
  return `/dashboard/channels/${c.connectionId}`;
}

export function ChannelsPage() {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [connections, setConnections] = useState<OperatorChannelConnection[]>([]);
  const [partner, setPartner] = useState<BookingComCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [startingBooking, setStartingBooking] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const [list, caps] = await Promise.all([
        listChannelConnections(tenantId, propertyId),
        fetchBookingComCapabilities(tenantId).catch(() => null),
      ]);
      setConnections(list);
      setPartner(caps);
    } catch (err) {
      setError(formatChannelApiError(err));
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const bookingConnection = useMemo(
    () => connections.find((c) => c.provider === "booking_com") ?? null,
    [connections],
  );
  const icalConnections = useMemo(
    () => connections.filter((c) => c.provider === "ical"),
    [connections],
  );

  async function createIcal() {
    if (!tenantId || !propertyId || !displayName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createIcalConnection(
        tenantId,
        displayName.trim(),
        propertyId,
      );
      setDialogOpen(false);
      setDisplayName("");
      window.location.href = `/dashboard/channels/${created.connectionId}`;
    } catch (err) {
      setCreateError(formatChannelApiError(err));
    } finally {
      setCreating(false);
    }
  }

  async function startBookingCom() {
    if (!tenantId || !propertyId) return;
    setStartingBooking(true);
    try {
      const result = await beginBookingComSetup(tenantId, {
        displayName: "Booking.com",
        workspacePropertyId: propertyId,
      });
      router.push(`/dashboard/channels/${result.connection.connectionId}/setup`);
    } catch (err) {
      setError(formatBookingComApiError(err));
    } finally {
      setStartingBooking(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;

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

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  const propertyLabel = property?.name ?? "αυτό το κατάλυμα";

  return (
    <div>
      <PageHeader
        title="Κανάλια"
        description="Χώρος διανομής — σύνδεση OTA και ροών ημερολογίου για το ενεργό κατάλυμα."
        meta={
          <span className="text-xs text-muted-foreground">
            Ενεργό κατάλυμα ·{" "}
            <span className="font-medium text-foreground">{propertyLabel}</span>
          </span>
        }
        actions={
          <div className="flex max-w-full flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/channels/help">Βοήθεια</Link>
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Προσθήκη iCal
            </Button>
          </div>
        }
      />

      <Surface variant="subtle" className="mb-5" padding="sm">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Οι συνδέσεις ανήκουν στον οργανισμό· η λίστα δείχνει σχέση με το ενεργό κατάλυμα μέσω αντιστοιχίσεων. Αλλάξτε ενεργό κατάλυμα στην κεφαλίδα για άλλο κατάλυμα.
        </p>
      </Surface>

      <section aria-labelledby="providers-heading" className="mb-6 space-y-3">
        <h2
          id="providers-heading"
          className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
        >
          Διαθέσιμες ενσωματώσεις
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <BookingComProviderCard
            connection={bookingConnection}
            partner={partner}
            onStart={() => void startBookingCom()}
            starting={startingBooking}
          />
          <IcalProviderCard
            count={icalConnections.length}
            onAdd={() => setDialogOpen(true)}
          />
          <ComingSoonProviderCard
            name="Airbnb"
            description="Η σύνδεση Airbnb δεν έχει υλοποιηθεί ακόμα. Μόνο για ενημέρωση."
          />
          <ComingSoonProviderCard
            name="Expedia"
            description="Το Expedia Partner Solutions δεν έχει υλοποιηθεί ακόμα. Μόνο για ενημέρωση."
          />
        </div>
      </section>

      <Surface padding="none">
        <div className="border-b border-border px-4 py-3">
          <SurfaceHeader
            className="mb-0"
            title="Συνδεδεμένα κανάλια"
            description={`Connections relevant to ${propertyLabel}`}
          />
        </div>
        {connections.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              title="Δεν υπάρχουν συνδέσεις καναλιών"
              description="Συνδέστε Booking.com ή προσθέστε ροή iCal για συγχρονισμό ημερομηνιών και κρατήσεων."
              action={{ label: "Προσθήκη iCal", onClick: () => setDialogOpen(true) }}
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Σύνδεση</TableHead>
                    <TableHead>Πάροχος</TableHead>
                    <TableHead>Κατάσταση</TableHead>
                    <TableHead className="hidden lg:table-cell">Σημειώσεις</TableHead>
                    <TableHead className="text-right">Ενέργειες</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections.map((c) => (
                    <TableRow key={c.connectionId}>
                      <TableCell className="font-medium">{c.displayName}</TableCell>
                      <TableCell className="text-xs">
                        {channelProviderLabel(c.provider)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={c.status}
                          label={channelStatusLabel(c.status)}
                        />
                      </TableCell>
                      <TableCell className="hidden max-w-[240px] truncate text-xs text-muted-foreground lg:table-cell">
                        {c.lastError ? (
                          <span className="text-destructive">{c.lastError}</span>
                        ) : c.hasCredentialRef ? (
                          "Η ροή συνδέθηκε"
                        ) : (
                          "Η ρύθμιση είναι ημιτελής"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={connectionHref(c)}>
                            {c.status === "draft" || c.status === "pending_auth"
                              ? "Συνέχεια ρύθμισης"
                              : "Open"}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {connections.map((c) => (
                <li key={c.connectionId} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{c.displayName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {channelProviderLabel(c.provider)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusBadge status={c.status} label={channelStatusLabel(c.status)} />
                    <Button asChild variant="outline" size="sm">
                      <Link href={connectionHref(c)}>Άνοιγμα</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Surface>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Δημιουργία σύνδεσης iCal</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Το Talos χρησιμοποιεί αυτή τη ροή για αποκλεισμό ημερομηνιών που κρατήθηκαν εξωτερικά. Το iCal δεν δημιουργεί κρατήσεις στο Talos.
          </p>
          <div className="space-y-2">
            <Label htmlFor="ical-display-name">Εμφανιζόμενο όνομα</Label>
            <Input
              id="ical-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="π.χ. αποκλεισμένες ημερομηνίες Airbnb"
            />
          </div>
          {createError ? (
            <p className="text-sm text-destructive">{createError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Ακύρωση
            </Button>
            <Button
              disabled={!displayName.trim() || creating}
              onClick={() => void createIcal()}
            >
              {creating ? "Δημιουργία…" : "Δημιουργία"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IcalProviderCard({ count, onAdd }: { count: number; onAdd: () => void }) {
  return (
    <Surface className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">iCal</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Εισαγωγή εξωτερικών αποκλεισμένων ημερομηνιών. Δεν δημιουργεί κρατήσεις Talos.
          </p>
        </div>
        <StatusBadge
          status={count > 0 ? "active" : "draft"}
          label={count > 0 ? `${count} ${elCommon.connected}` : elCommon.available}
        />
      </div>
      <div className="mt-4">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Προσθήκη σύνδεσης iCal
        </Button>
      </div>
    </Surface>
  );
}
