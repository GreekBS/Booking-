import { useCallback, useEffect, useState } from "react";
import type {
  IStorefrontClient,
  PublicUnitSummary,
  WidgetEvent,
} from "@hcp/storefront-sdk";

export type BookingFlowStep = "dates" | "guest" | "confirm" | "success";

export interface GuestDetails {
  name: string;
  email: string;
  phone: string;
}

export interface UseBookingFlowOptions {
  client: IStorefrontClient;
  mockMode: boolean;
  unitId?: string;
  propertySlug?: string;
  checkIn?: string;
  checkOut?: string;
  guestCount?: number;
  currency?: string;
  onEvent?: (event: WidgetEvent) => void;
}

export interface BookingFlowState {
  step: BookingFlowStep;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  guest: GuestDetails;
  unitId: string | null;
  units: PublicUnitSummary[];
  total: string | null;
  currency: string;
  confirmationCode: string | null;
  error: string | null;
  loading: boolean;
  loadingMessage: string | null;
  resolvedPropertyName: string | null;
}

function createIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}`;
}

const defaultGuest: GuestDetails = {
  name: "",
  email: "",
  phone: "",
};

export function useBookingFlow({
  client,
  mockMode,
  unitId: initialUnitId,
  propertySlug,
  checkIn: initialCheckIn = "",
  checkOut: initialCheckOut = "",
  guestCount: initialGuestCount = 2,
  currency = "EUR",
  onEvent,
}: UseBookingFlowOptions) {
  const emit = useCallback(
    (event: WidgetEvent) => {
      onEvent?.(event);
    },
    [onEvent],
  );

  const [step, setStep] = useState<BookingFlowStep>("dates");
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guestCount, setGuestCount] = useState(initialGuestCount);
  const [guest, setGuest] = useState<GuestDetails>(defaultGuest);
  const [unitId, setUnitId] = useState<string | null>(initialUnitId ?? null);
  const [units, setUnits] = useState<PublicUnitSummary[]>([]);
  const [resolvedPropertyName, setResolvedPropertyName] = useState<string | null>(null);
  const [total, setTotal] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState(currency);
  const [confirmationCode, setConfirmationCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [catalogReady, setCatalogReady] = useState(!propertySlug);

  useEffect(() => {
    emit({ type: "ready", version: "0.0.1" });
  }, [emit]);

  useEffect(() => {
    if (!propertySlug) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadingMessage("Loading property…");
    client
      .getProperty(propertySlug)
      .then((property) => {
        if (cancelled) return;
        setResolvedPropertyName(property.name);
        setUnits(property.units);
        if (!initialUnitId && property.units.length > 0) {
          setUnitId(property.units[0]!.id);
        }
        setCatalogReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : "Failed to load property";
        setError(message);
        emit({ type: "error", code: "PROPERTY_LOAD_FAILED", message });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingMessage(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, emit, initialUnitId, propertySlug]);

  const checkAvailability = useCallback(async () => {
    if (!unitId) {
      setError("Select a unit to continue");
      return;
    }
    setError(null);
    setLoading(true);
    setLoadingMessage("Checking availability…");
    emit({ type: "dates_selected", checkIn, checkOut, guestCount });
    try {
      const availability = await client.checkAvailability(unitId, {
        checkIn,
        checkOut,
        guestCount,
      });
      emit({
        type: "availability_checked",
        available: availability.available,
        reasons: availability.reasons.map((r) => r.message),
      });
      if (!availability.available) {
        setError("Selected dates are not available");
        emit({ type: "error", code: "AVAILABILITY_UNAVAILABLE", message: "Unavailable" });
        return;
      }
      const preview = await client.previewPrice(unitId, { checkIn, checkOut, guestCount });
      setTotal(preview.total);
      setDisplayCurrency(preview.currency);
      emit({
        type: "price_updated",
        total: preview.total,
        currency: preview.currency,
      });
      setStep("guest");
      emit({ type: "guest_step" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Availability check failed";
      setError(message);
      emit({ type: "error", code: "AVAILABILITY_CHECK_FAILED", message });
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }, [checkIn, checkOut, client, emit, guestCount, unitId]);

  const goToConfirm = useCallback(() => {
    if (!guest.name.trim() || !guest.email.trim()) {
      setError("Name and email are required");
      return;
    }
    setError(null);
    setStep("confirm");
  }, [guest.email, guest.name]);

  const confirmBooking = useCallback(async () => {
    if (!unitId) {
      setError("Unit is required");
      return;
    }
    setError(null);
    setLoading(true);
    emit({ type: "booking_submitted" });
    try {
      setLoadingMessage("Creating hold…");
      const hold = await client.createHold(
        { unitId, checkIn, checkOut, guestCount },
        mockMode ? undefined : createIdempotencyKey("hold"),
      );
      emit({ type: "hold_created", holdId: hold.id, expiresAt: hold.expiresAt });

      setLoadingMessage("Creating quote…");
      const quote = await client.createQuote({ holdId: hold.id });
      setTotal(quote.snapshot.total);
      setDisplayCurrency(quote.snapshot.currency);
      emit({
        type: "price_updated",
        total: quote.snapshot.total,
        currency: quote.snapshot.currency,
      });

      setLoadingMessage("Confirming booking…");
      const booking = await client.createBooking(
        {
          quoteId: quote.id,
          guest: {
            name: guest.name.trim(),
            email: guest.email.trim(),
            phone: guest.phone.trim() || null,
          },
        },
        mockMode ? undefined : createIdempotencyKey("booking"),
      );
      setConfirmationCode(booking.confirmationCode);
      setStep("success");
      emit({
        type: "booking_completed",
        confirmationCode: booking.confirmationCode,
        bookingId: booking.id,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Booking failed";
      setError(message);
      emit({ type: "error", code: "BOOKING_FAILED", message });
    } finally {
      setLoading(false);
      setLoadingMessage(null);
    }
  }, [checkIn, checkOut, client, emit, guest, guestCount, mockMode, unitId]);

  const state: BookingFlowState = {
    step,
    checkIn,
    checkOut,
    guestCount,
    guest,
    unitId,
    units,
    total,
    currency: displayCurrency,
    confirmationCode,
    error,
    loading,
    loadingMessage,
    resolvedPropertyName,
  };

  return {
    state,
    catalogReady,
    setCheckIn,
    setCheckOut,
    setGuestCount,
    setGuest,
    setUnitId,
    setStep,
    checkAvailability,
    goToConfirm,
    confirmBooking,
  };
}
