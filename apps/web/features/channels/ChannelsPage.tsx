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

  const propertyLabel = property?.name ?? "this property";

  return (
    <div>
      <PageHeader
        title="Channels"
        description="Distribution workspace — connect OTAs and calendar feeds for the active property."
        meta={
          <span className="text-xs text-muted-foreground">
            Active property ·{" "}
            <span className="font-medium text-foreground">{propertyLabel}</span>
          </span>
        }
        actions={
          <div className="flex max-w-full flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/channels/help">Help</Link>
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add iCal
            </Button>
          </div>
        }
      />

      <Surface variant="subtle" className="mb-5" padding="sm">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Connections are tenant-scoped; this list shows relevance for the Active Property via
          mappings and workspace drafts. Switch Active Property in the header to focus another
          property.
        </p>
      </Surface>

      <section aria-labelledby="providers-heading" className="mb-6 space-y-3">
        <h2
          id="providers-heading"
          className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
        >
          Available integrations
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
            description="Airbnb Connectivity is not implemented yet. Informational only."
          />
          <ComingSoonProviderCard
            name="Expedia"
            description="Expedia Partner Solutions is not implemented yet. Informational only."
          />
        </div>
      </section>

      <Surface padding="none">
        <div className="border-b border-border px-4 py-3">
          <SurfaceHeader
            className="mb-0"
            title="Connected channels"
            description={`Connections relevant to ${propertyLabel}`}
          />
        </div>
        {connections.length === 0 ? (
          <div className="p-4">
            <EmptyState
              compact
              title="No channel connections"
              description="Connect Booking.com or add an iCal feed to sync blocked dates and reservations."
              action={{ label: "Add iCal", onClick: () => setDialogOpen(true) }}
            />
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Connection</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                          "Feed connected"
                        ) : (
                          "Setup incomplete"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={connectionHref(c)}>
                            {c.status === "draft" || c.status === "pending_auth"
                              ? "Continue setup"
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
                      <Link href={connectionHref(c)}>Open</Link>
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
            <DialogTitle>Create iCal connection</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Talos uses this calendar feed to block externally reserved dates. iCal does
            not create Talos bookings.
          </p>
          <div className="space-y-2">
            <Label htmlFor="ical-display-name">Display name</Label>
            <Input
              id="ical-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Airbnb blocked dates"
            />
          </div>
          {createError ? (
            <p className="text-sm text-destructive">{createError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!displayName.trim() || creating}
              onClick={() => void createIcal()}
            >
              {creating ? "Creating…" : "Create"}
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
            Import external blocked dates. Does not create Talos bookings.
          </p>
        </div>
        <StatusBadge
          status={count > 0 ? "active" : "draft"}
          label={count > 0 ? `${count} connected` : "Available"}
        />
      </div>
      <div className="mt-4">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add iCal connection
        </Button>
      </div>
    </Surface>
  );
}
