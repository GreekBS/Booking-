"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { useActiveProperty } from "@/hooks/use-active-property";
import {
  adminFetch,
  createManualBooking,
  fetchPropertyUnitCatalog,
  flattenCatalogUnits,
} from "@/lib/admin/api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import type { CatalogPropertyRecord, QuoteRecord, BookingRecord } from "@/lib/admin/types";
import { formatMoney } from "@/lib/admin/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STEPS = [
  "Property & unit",
  "Dates & guests",
  "Availability",
  "Quote",
  "Create booking",
  "Confirm",
] as const;

export function ManualBookingPage() {
  const router = useRouter();
  const { tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId: activePropertyId,
    property: activeProperty,
    ready: propertyReady,
  } = useActiveProperty();
  const [step, setStep] = useState(0);
  const [properties, setProperties] = useState<CatalogPropertyRecord[]>([]);
  const [units, setUnits] = useState<
    Array<{ id: string; name: string; status: string; propertyId: string; propertyName: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [availabilityOk, setAvailabilityOk] = useState<boolean | null>(null);
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });

  const filteredUnits = useMemo(
    () => units.filter((u) => !propertyId || u.propertyId === propertyId),
    [units, propertyId],
  );

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      setLoading(true);
      try {
        const catalog = await fetchPropertyUnitCatalog(tenantId!);
        setProperties(catalog.properties);
        setUnits(flattenCatalogUnits(catalog));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [tenantId]);

  // Default to Active Property once catalog + property context are ready.
  useEffect(() => {
    if (defaultsApplied || !propertyReady || properties.length === 0) return;
    if (activePropertyId && properties.some((p) => p.id === activePropertyId)) {
      setPropertyId(activePropertyId);
    }
    setDefaultsApplied(true);
  }, [activePropertyId, defaultsApplied, properties, propertyReady]);

  async function checkAvailability() {
    if (!tenantId || !unitId) return;
    setSubmitting(true);
    setAvailabilityOk(null);
    try {
      const result = await adminFetch<{ available: boolean }>(
        `/units/${unitId}/availability/check?checkIn=${checkIn}&checkOut=${checkOut}&guestCount=${guestCount}`,
        { tenantId },
      );
      setAvailabilityOk(result.available);
      if (result.available) {
        setStep(3);
      } else {
        toastError("Dates are not available");
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Availability check failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function generateQuote() {
    if (!tenantId || !unitId) return;
    setSubmitting(true);
    try {
      const hold = await adminFetch<{ id: string }>("/holds", {
        method: "POST",
        tenantId,
        body: JSON.stringify({ unitId, checkIn, checkOut, guestCount }),
      });
      const q = await adminFetch<QuoteRecord>("/quotes", {
        method: "POST",
        tenantId,
        body: JSON.stringify({ holdId: hold.id }),
      });
      setQuote(q);
      setStep(4);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Quote failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function createBooking(confirm: boolean) {
    if (!tenantId) return;
    setSubmitting(true);
    try {
      const result = (await createManualBooking(tenantId, {
        unitId,
        checkIn,
        checkOut,
        guestCount,
        guest: { name: guest.name, email: guest.email, phone: guest.phone || null },
        confirm,
      })) as { booking: BookingRecord };
      setBooking(result.booking);
      toastSuccess(confirm ? "Booking confirmed" : "Booking created");
      if (confirm) {
        setStep(5);
      } else {
        router.push(`/dashboard/bookings?bookingId=${encodeURIComponent(result.booking.id)}`);
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;
  if (loading || !propertyReady) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} />;

  const selectedPropertyName =
    properties.find((p) => p.id === propertyId)?.name ?? activeProperty?.name;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="New booking"
        description={
          selectedPropertyName
            ? `Manual reservation · ${selectedPropertyName}`
            : "Create a reservation without payment"
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/bookings">Back</Link>
          </Button>
        }
      />

      <ol className="flex flex-wrap gap-1.5" aria-label="Booking steps">
        {STEPS.map((label, index) => (
          <li key={label}>
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-medium",
                index === step
                  ? "bg-primary text-primary-foreground"
                  : index < step
                    ? "bg-primary-subtle text-primary"
                    : "border border-border text-muted-foreground",
              )}
            >
              {index + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title={STEPS[step]!}
          description={`Step ${step + 1} of ${STEPS.length}`}
        />
        <div className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Property</Label>
                <Select
                  value={propertyId}
                  onValueChange={(v) => {
                    setPropertyId(v);
                    setUnitId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.id === activePropertyId ? " (active)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activePropertyId ? (
                  <p className="text-[11px] text-muted-foreground">
                    Defaults to Active Property. You may select another authorized property.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unitId} onValueChange={setUnitId} disabled={!propertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredUnits.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={!unitId} onClick={() => setStep(1)}>
                Continue
              </Button>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mb-check-in">Check-in</Label>
                  <Input
                    id="mb-check-in"
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mb-check-out">Check-out</Label>
                  <Input
                    id="mb-check-out"
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guests">Guests</Label>
                <Input
                  id="mb-guests"
                  type="number"
                  min={1}
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button disabled={!checkIn || !checkOut} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Check availability for {checkIn} → {checkOut}, {guestCount} guest(s)
              </p>
              {availabilityOk === false ? (
                <p className="text-sm text-destructive">Not available for selected dates.</p>
              ) : null}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button disabled={submitting} onClick={() => void checkAvailability()}>
                  {submitting ? "Checking…" : "Check availability"}
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-success">Dates are available.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button disabled={submitting} onClick={() => void generateQuote()}>
                  {submitting ? "Generating…" : "Generate quote"}
                </Button>
              </div>
            </>
          )}

          {step === 4 && quote && (
            <>
              <div className="rounded-md border border-border bg-surface-subtle/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Reservation total · </span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(quote.totalAmount, quote.currency)}
                </span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guest-name">Guest name</Label>
                <Input
                  id="mb-guest-name"
                  value={guest.name}
                  onChange={(e) => setGuest({ ...guest, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guest-email">Guest email</Label>
                <Input
                  id="mb-guest-email"
                  type="email"
                  value={guest.email}
                  onChange={(e) => setGuest({ ...guest, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guest-phone">Phone (optional)</Label>
                <Input
                  id="mb-guest-phone"
                  value={guest.phone}
                  onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>
                  Back
                </Button>
                <Button
                  disabled={submitting || !guest.name || !guest.email}
                  onClick={() => void createBooking(false)}
                >
                  Create pending
                </Button>
                <Button
                  variant="secondary"
                  disabled={submitting || !guest.name || !guest.email}
                  onClick={() => void createBooking(true)}
                >
                  Create &amp; confirm
                </Button>
              </div>
            </>
          )}

          {step === 5 && booking && (
            <>
              <p className="text-sm">
                Booking <span className="font-mono text-xs">{booking.id.slice(0, 8)}</span> is{" "}
                <strong>{booking.status}</strong>.
              </p>
              <Button asChild>
                <Link href={`/dashboard/bookings?bookingId=${encodeURIComponent(booking.id)}`}>
                  Open reservation
                </Link>
              </Button>
            </>
          )}
        </div>
      </Surface>
    </div>
  );
}
