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
import { EmptyState } from "@/components/admin/empty-state";
import { ErrorState } from "@/components/admin/error-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "error" || status === "disconnected") return "destructive";
  if (status === "paused" || status === "pending_auth") return "secondary";
  return "outline";
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
    <div className="space-y-8">
      <PageHeader
        title="Channels"
        description={`Channel connections for ${propertyLabel}. Switch Active Property to manage another property's channels.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/channels/help">Help Center</Link>
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add iCal connection
            </Button>
          </div>
        }
      />

      <section aria-labelledby="providers-heading" className="space-y-3">
        <h2 id="providers-heading" className="text-sm font-semibold tracking-wide text-muted-foreground">
          Providers
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <BookingComProviderCard
            connection={bookingConnection}
            partner={partner}
            onStart={() => void startBookingCom()}
            starting={startingBooking}
          />
          <ComingSoonProviderCard
            name="Airbnb"
            description="Airbnb Connectivity is not implemented yet. This card is informational only."
          />
          <ComingSoonProviderCard
            name="Expedia"
            description="Expedia Partner Solutions is not implemented yet. This card is informational only."
          />
          <CardIcalSummary
            count={icalConnections.length}
            onAdd={() => setDialogOpen(true)}
          />
        </div>
      </section>

      <section aria-labelledby="connections-heading" className="space-y-3">
        <h2 id="connections-heading" className="text-sm font-semibold tracking-wide text-muted-foreground">
          Connections for {propertyLabel}
        </h2>
        {connections.length === 0 ? (
          <EmptyState
            title="No channel connections"
            description="Connect Booking.com or add an iCal feed to get started."
            action={{ label: "Add iCal connection", onClick: () => setDialogOpen(true) }}
          />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((c) => (
                  <TableRow key={c.connectionId}>
                    <TableCell>
                      <Link
                        href={
                          c.provider === "booking_com" &&
                          (c.status === "draft" || c.status === "pending_auth")
                            ? `/dashboard/channels/${c.connectionId}/setup`
                            : `/dashboard/channels/${c.connectionId}`
                        }
                        className="font-medium text-primary hover:underline"
                      >
                        {c.displayName}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">
                      {c.provider === "booking_com" ? "Booking.com" : c.provider}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(c.status)} className="capitalize">
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {c.lastError ? (
                        <span className="text-destructive">{c.lastError}</span>
                      ) : c.hasCredentialRef ? (
                        "Credential present"
                      ) : (
                        "No credential"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

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

function CardIcalSummary({
  count,
  onAdd,
}: {
  count: number;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">iCal</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Import external blocked dates. Does not create Talos bookings.
          </p>
        </div>
        <Badge variant="secondary">{count} connected</Badge>
      </div>
      <div className="mt-4">
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add iCal connection
        </Button>
      </div>
    </div>
  );
}
