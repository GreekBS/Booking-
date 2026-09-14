"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import {
  adminFetch,
  createManualBooking,
  fetchAllProperties,
  flattenUnits,
} from "@/lib/admin/api";
import { toastError, toastSuccess } from "@/lib/admin/toast";
import type { FlatUnit, PropertyRecord, QuoteRecord, BookingRecord } from "@/lib/admin/types";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [step, setStep] = useState(0);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [units, setUnits] = useState<FlatUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const props = await fetchAllProperties(tenantId!, 1, 100);
        setProperties(props.data);
        setUnits(flattenUnits(props.data));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [tenantId]);

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
      const result = await createManualBooking(tenantId, {
        unitId,
        checkIn,
        checkOut,
        guestCount,
        guest: { name: guest.name, email: guest.email, phone: guest.phone || null },
        confirm,
      }) as { booking: BookingRecord };
      setBooking(result.booking);
      toastSuccess(confirm ? "Booking confirmed" : "Booking created");
      if (confirm) {
        setStep(5);
      } else {
        router.push("/dashboard/bookings");
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
  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <PageHeader
        title="Manual booking"
        description="Create a reservation without payment"
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/bookings">Back to bookings</Link>
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`rounded-full px-3 py-1 text-xs ${
              index === step
                ? "bg-primary text-primary-foreground"
                : index < step
                  ? "bg-muted text-muted-foreground"
                  : "border text-muted-foreground"
            }`}
          >
            {index + 1}. {label}
          </span>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>Step {step + 1} of {STEPS.length}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-lg">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={propertyId} onValueChange={(v) => { setPropertyId(v); setUnitId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select value={unitId} onValueChange={setUnitId} disabled={!propertyId}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    {filteredUnits.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={!unitId} onClick={() => setStep(1)}>Continue</Button>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Check-in</Label>
                  <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Check-out</Label>
                  <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Guests</Label>
                <Input
                  type="number"
                  min={1}
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number.parseInt(e.target.value, 10) || 1)}
                />
              </div>
              <Button disabled={!checkIn || !checkOut} onClick={() => setStep(2)}>Continue</Button>
            </>
          )}

          {step === 2 && (
            <>
              <p className="text-sm text-muted-foreground">
                Check availability for {checkIn} → {checkOut}, {guestCount} guest(s)
              </p>
              {availabilityOk === false && (
                <p className="text-sm text-destructive">Not available for selected dates.</p>
              )}
              <Button disabled={submitting} onClick={() => void checkAvailability()}>
                {submitting ? "Checking..." : "Check availability"}
              </Button>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-green-600">Dates are available.</p>
              <Button disabled={submitting} onClick={() => void generateQuote()}>
                {submitting ? "Generating..." : "Generate quote"}
              </Button>
            </>
          )}

          {step === 4 && quote && (
            <>
              <p className="text-sm">Total: {quote.totalAmount} {quote.currency}</p>
              <div className="space-y-2">
                <Label>Guest name</Label>
                <Input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Guest email</Label>
                <Input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone (optional)</Label>
                <Input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={submitting || !guest.name || !guest.email}
                  onClick={() => void createBooking(false)}
                >
                  Create pending booking
                </Button>
                <Button
                  variant="secondary"
                  disabled={submitting || !guest.name || !guest.email}
                  onClick={() => void createBooking(true)}
                >
                  Create & confirm
                </Button>
              </div>
            </>
          )}

          {step === 5 && booking && (
            <>
              <p className="text-sm">Booking {booking.id} is {booking.status}.</p>
              <Button asChild>
                <Link href="/dashboard/bookings">View bookings</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
