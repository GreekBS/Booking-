"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { useActiveProperty } from "@/hooks/use-active-property";
import {
  adminFetch,
  createBookingFromQuote,
  createManualBooking,
  fetchPropertyUnitCatalog,
  flattenCatalogUnits,
  getGuestForBookingSelection,
  previewQuoteForStay,
  searchGuestsForBooking,
  type StayPricingPreview,
} from "@/lib/admin/api";
import type { GuestBookingSelectionRecord } from "@/lib/admin/types";
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
import { elCommon, statusLabelEl } from "@/lib/i18n";

const STEPS = [
  "Κατάλυμα & μονάδα",
  "Ημερομηνίες & επισκέπτες",
  "Διαθεσιμότητα",
  "Προσφορά",
  "Δημιουργία κράτησης",
  "Επιβεβαίωση",
] as const;

export function ManualBookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteIdFromUrl = searchParams.get("quoteId");
  const guestIdFromUrl = searchParams.get("guestId");
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
  /** Read-only pricing preview (no Hold). */
  const [pricePreview, setPricePreview] = useState<StayPricingPreview | null>(null);
  /** Existing commercial Quote from Hold conversion (?quoteId=). */
  const [commercialQuote, setCommercialQuote] = useState<QuoteRecord | null>(null);
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [guest, setGuest] = useState({ name: "", email: "", phone: "" });
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [guestSearchResults, setGuestSearchResults] = useState<GuestBookingSelectionRecord[]>([]);
  const [guestSearchLoading, setGuestSearchLoading] = useState(false);

  const filteredUnits = useMemo(
    () => units.filter((u) => !propertyId || u.propertyId === propertyId),
    [units, propertyId],
  );

  const displayTotal = commercialQuote ?? pricePreview;

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      setLoading(true);
      try {
        const catalog = await fetchPropertyUnitCatalog(tenantId!);
        setProperties(catalog.properties);
        setUnits(flattenCatalogUnits(catalog));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης καταλόγου");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [tenantId]);

  useEffect(() => {
    if (defaultsApplied || !activePropertyId || properties.length === 0) return;
    if (properties.some((p) => p.id === activePropertyId)) {
      setPropertyId(activePropertyId);
    }
    setDefaultsApplied(true);
  }, [defaultsApplied, activePropertyId, properties]);

  useEffect(() => {
    if (!tenantId || !guestIdFromUrl) return;
    const propForGuest = propertyId || activePropertyId;
    if (!propForGuest) return;
    let cancelled = false;
    async function loadGuestFromUrl() {
      try {
        const picked = await getGuestForBookingSelection(tenantId!, {
          guestId: guestIdFromUrl!,
          propertyId: propForGuest!,
        });
        if (cancelled) return;
        setSelectedGuestId(picked.id);
        setGuest({
          name: picked.displayName,
          email: picked.email ?? "",
          phone: picked.phone ?? "",
        });
      } catch {
        /* deep link invalid — operator can still type contact */
      }
    }
    void loadGuestFromUrl();
    return () => {
      cancelled = true;
    };
  }, [tenantId, guestIdFromUrl, propertyId, activePropertyId]);

  useEffect(() => {
    if (!tenantId || !propertyId) {
      setGuestSearchResults([]);
      return;
    }
    const q = guestSearch.trim();
    if (q.length < 2) {
      setGuestSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        setGuestSearchLoading(true);
        try {
          const res = await searchGuestsForBooking(tenantId, {
            propertyId,
            search: q,
            limit: 8,
          });
          setGuestSearchResults(res.data ?? []);
        } catch {
          setGuestSearchResults([]);
        } finally {
          setGuestSearchLoading(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [tenantId, propertyId, guestSearch]);

  function selectExistingGuest(picked: GuestBookingSelectionRecord) {
    setSelectedGuestId(picked.id);
    setGuest({
      name: picked.displayName,
      email: picked.email ?? "",
      phone: picked.phone ?? "",
    });
    setGuestSearch("");
    setGuestSearchResults([]);
  }

  function clearGuestSelection() {
    setSelectedGuestId(null);
    setGuestSearch("");
    setGuestSearchResults([]);
  }

  // Hold → booking: consume existing quoteId from URL.
  useEffect(() => {
    if (!tenantId || !quoteIdFromUrl) return;
    let cancelled = false;
    async function loadQuote() {
      setLoading(true);
      setError(null);
      try {
        const q = await adminFetch<QuoteRecord>(`/quotes/${quoteIdFromUrl}`, {
          tenantId: tenantId!,
        });
        if (cancelled) return;
        setCommercialQuote(q);
        setPricePreview(null);
        setStep(4);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης προσφοράς");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadQuote();
    return () => {
      cancelled = true;
    };
  }, [tenantId, quoteIdFromUrl]);

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
        toastError("Οι ημερομηνίες δεν είναι διαθέσιμες");
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία ελέγχου διαθεσιμότητας");
    } finally {
      setSubmitting(false);
    }
  }

  /** Read-only price estimate — does not create Hold/Quote/inventory. */
  async function generateQuote() {
    if (!tenantId || !unitId) return;
    setSubmitting(true);
    try {
      const preview = await previewQuoteForStay(
        tenantId,
        unitId,
        checkIn,
        checkOut,
        guestCount,
      );
      setPricePreview(preview);
      setCommercialQuote(null);
      setStep(4);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία προσφοράς");
    } finally {
      setSubmitting(false);
    }
  }

  async function createBooking(confirm: boolean) {
    if (!tenantId) return;
    setSubmitting(true);
    try {
      let created: BookingRecord;

      if (commercialQuote) {
        // Consume the Hold-backed Quote (Hold → Booking path).
        created = (await createBookingFromQuote(tenantId, {
          quoteId: commercialQuote.id,
          guest: { name: guest.name, email: guest.email, phone: guest.phone || null },
          guestId: selectedGuestId,
          confirmationMode: "manual",
        })) as BookingRecord;

        if (confirm) {
          created = (await adminFetch<BookingRecord>(
            `/bookings/${created.id}/confirm`,
            { method: "POST", tenantId },
          )) as BookingRecord;
        }
      } else {
        // Single Hold+Quote+Booking via manual pipeline (no orphan preview Hold).
        const result = (await createManualBooking(tenantId, {
          unitId,
          checkIn,
          checkOut,
          guestCount,
          guest: { name: guest.name, email: guest.email, phone: guest.phone || null },
          guestId: selectedGuestId,
          confirm,
        })) as { booking: BookingRecord };
        created = result.booking;
      }

      setBooking(created);
      toastSuccess(confirm ? "Η κράτηση επιβεβαιώθηκε" : "Η κράτηση δημιουργήθηκε");
      if (confirm) {
        setStep(5);
      } else {
        router.push(`/dashboard/bookings?bookingId=${encodeURIComponent(created.id)}`);
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Αποτυχία δημιουργίας κράτησης");
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
  const convertingHold = Boolean(commercialQuote);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Νέα κράτηση"
        description={
          convertingHold
            ? "Συμπληρώστε τα στοιχεία επισκέπτη για μετατροπή της υπάρχουσας δέσμευσης"
            : selectedPropertyName
              ? `Χειροκίνητη κράτηση · ${selectedPropertyName}`
              : "Δημιουργία κράτησης χωρίς online πληρωμή"
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/bookings">{elCommon.back}</Link>
          </Button>
        }
      />

      {!convertingHold ? (
        <ol className="flex flex-wrap gap-1.5" aria-label="Βήματα κράτησης">
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
      ) : null}

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title={convertingHold ? "Επισκέπτης & επιβεβαίωση" : STEPS[step]!}
          description={
            convertingHold
              ? "Η κράτηση θα καταναλώσει την προσφορά της δέσμευσης"
              : `Βήμα ${step + 1} από ${STEPS.length}`
          }
        />
        <div className="space-y-4">
          {step === 0 && !convertingHold && (
            <>
              <div className="space-y-2">
                <Label htmlFor="mb-property">{elCommon.property}</Label>
                <Select
                  value={propertyId}
                  onValueChange={(v) => {
                    setPropertyId(v);
                    setUnitId("");
                  }}
                >
                  <SelectTrigger id="mb-property" aria-label={`Επιλογή ${elCommon.property.toLowerCase()}`}>
                    <SelectValue placeholder={`Επιλέξτε ${elCommon.property.toLowerCase()}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.id === activePropertyId ? " (ενεργό)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activePropertyId ? (
                  <p className="text-[11px] text-muted-foreground">
                    Προεπιλογή το ενεργό κατάλυμα. Μπορείτε να επιλέξετε άλλο εξουσιοδοτημένο
                    κατάλυμα.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-unit">{elCommon.unit}</Label>
                <Select value={unitId} onValueChange={setUnitId} disabled={!propertyId}>
                  <SelectTrigger id="mb-unit" aria-label={`Επιλογή ${elCommon.unit.toLowerCase()}`}>
                    <SelectValue placeholder={`Επιλέξτε ${elCommon.unit.toLowerCase()}`} />
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
                {elCommon.continue}
              </Button>
            </>
          )}

          {step === 1 && !convertingHold && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mb-check-in">{elCommon.checkIn}</Label>
                  <Input
                    id="mb-check-in"
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mb-check-out">{elCommon.checkOut}</Label>
                  <Input
                    id="mb-check-out"
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guests">{elCommon.guests}</Label>
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
                  {elCommon.back}
                </Button>
                <Button disabled={!checkIn || !checkOut} onClick={() => setStep(2)}>
                  {elCommon.continue}
                </Button>
              </div>
            </>
          )}

          {step === 2 && !convertingHold && (
            <>
              <p className="text-sm text-muted-foreground">
                Έλεγχος διαθεσιμότητας για {checkIn} → {checkOut}, {guestCount}{" "}
                {guestCount === 1 ? "επισκέπτη" : "επισκέπτες"}
              </p>
              {availabilityOk === false ? (
                <p className="text-sm text-destructive">Μη διαθέσιμο για τις επιλεγμένες ημερομηνίες.</p>
              ) : null}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  {elCommon.back}
                </Button>
                <Button disabled={submitting} onClick={() => void checkAvailability()}>
                  {submitting ? "Έλεγχος…" : "Έλεγχος διαθεσιμότητας"}
                </Button>
              </div>
            </>
          )}

          {step === 3 && !convertingHold && (
            <>
              <p className="text-sm text-success">Οι ημερομηνίες είναι διαθέσιμες.</p>
              <p className="text-xs text-muted-foreground">
                Η προεπισκόπηση τιμής είναι μόνο για ανάγνωση. Η δέσμευση αποθέματος δημιουργείται
                μόνο κατά τη δημιουργία της κράτησης.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  {elCommon.back}
                </Button>
                <Button disabled={submitting} onClick={() => void generateQuote()}>
                  {submitting ? "Υπολογισμός…" : "Προεπισκόπηση τιμής"}
                </Button>
              </div>
            </>
          )}

          {step === 4 && displayTotal && (
            <>
              <div className="rounded-md border border-border bg-surface-subtle/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  {commercialQuote ? "Σύνολο προσφοράς · " : "Εκτιμώμενο σύνολο · "}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(displayTotal.totalAmount, displayTotal.currency)}
                </span>
                {!commercialQuote ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Μόνο εκτίμηση — η τελική προσφορά δημιουργείται με την κράτηση.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guest-search">Εύρεση υπάρχοντος επισκέπτη</Label>
                <Input
                  id="mb-guest-search"
                  placeholder="Αναζήτηση με όνομα, email ή τηλέφωνο (min. 2 χαρακτ.)…"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  disabled={!propertyId}
                />
                {!propertyId ? (
                  <p className="text-[11px] text-muted-foreground">
                    Επιλέξτε κατάλυμα στο βήμα 1 για αναζήτηση επισκεπτών CRM.
                  </p>
                ) : null}
                {guestSearchLoading ? (
                  <p className="text-xs text-muted-foreground">Αναζήτηση…</p>
                ) : null}
                {guestSearchResults.length > 0 ? (
                  <ul className="max-h-40 overflow-y-auto rounded-md border border-border">
                    {guestSearchResults.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => selectExistingGuest(g)}
                        >
                          <span className="font-medium">{g.displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            {[g.email, g.phone].filter(Boolean).join(" · ") || "Χωρίς στοιχεία επικοινωνίας"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {selectedGuestId ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-surface-subtle/50 px-3 py-2 text-sm">
                    <span>
                      Συνδεδεμένος επισκέπτης CRM ·{" "}
                      <span className="font-medium">{guest.name || "Επιλεγμένος"}</span>
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={clearGuestSelection}>
                      {elCommon.remove}
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guest-name">Όνομα επισκέπτη</Label>
                <Input
                  id="mb-guest-name"
                  value={guest.name}
                  onChange={(e) => {
                    if (selectedGuestId) setSelectedGuestId(null);
                    setGuest({ ...guest, name: e.target.value });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guest-email">Email επισκέπτη</Label>
                <Input
                  id="mb-guest-email"
                  type="email"
                  value={guest.email}
                  onChange={(e) => {
                    if (selectedGuestId) setSelectedGuestId(null);
                    setGuest({ ...guest, email: e.target.value });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mb-guest-phone">{`${elCommon.phone} (${elCommon.optional.toLowerCase()})`}</Label>
                <Input
                  id="mb-guest-phone"
                  value={guest.phone}
                  onChange={(e) => {
                    if (selectedGuestId) setSelectedGuestId(null);
                    setGuest({ ...guest, phone: e.target.value });
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!convertingHold ? (
                  <Button variant="outline" onClick={() => setStep(3)}>
                    {elCommon.back}
                  </Button>
                ) : null}
                <Button
                  disabled={submitting || !guest.name || !guest.email}
                  onClick={() => void createBooking(false)}
                >
                  Δημιουργία (σε αναμονή)
                </Button>
                <Button
                  variant="secondary"
                  disabled={submitting || !guest.name || !guest.email}
                  onClick={() => void createBooking(true)}
                >
                  Δημιουργία &amp; επιβεβαίωση
                </Button>
              </div>
            </>
          )}

          {step === 5 && booking && (
            <>
              <p className="text-sm">
                Η κράτηση <span className="font-mono text-xs">{booking.id.slice(0, 8)}</span> είναι{" "}
                <strong>{statusLabelEl(booking.status)}</strong>.
              </p>
              <Button asChild>
                <Link href={`/dashboard/bookings?bookingId=${encodeURIComponent(booking.id)}`}>
                  Άνοιγμα κράτησης
                </Link>
              </Button>
            </>
          )}
        </div>
      </Surface>
    </div>
  );
}
