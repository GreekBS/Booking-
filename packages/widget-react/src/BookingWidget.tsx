import { useState } from "react";
import { themeToCssVariables, MOCK_PUBLISHABLE_KEY, mockUnit } from "@hcp/storefront-sdk";
import type { ThemeConfig } from "@hcp/storefront-sdk";
import type { BookingWidgetProps } from "./BookingWidget.types.js";
import { defaultBookingWidgetProps } from "./BookingWidget.types.js";
import {
  HcpStorefrontProvider,
  useStorefrontContext,
  useStorefrontClient,
  useWidgetEventEmitter,
} from "./HcpStorefrontProvider.js";
import { useBookingFlow } from "./useBookingFlow.js";
import { useIframeBridge, type UseIframeBridgeOptions } from "./useIframeBridge.js";

function ThemedRoot({
  children,
  className,
  themeOverride,
}: {
  children: React.ReactNode;
  className?: string;
  themeOverride?: Partial<ThemeConfig>;
}) {
  const { theme } = useStorefrontContext();
  const merged = themeOverride
    ? {
        ...theme,
        ...themeOverride,
        colors: { ...theme.colors, ...themeOverride.colors },
      }
    : theme;
  const style = themeToCssVariables(merged) as React.CSSProperties;
  return (
    <div className={className} style={style} data-hcp-widget-root>
      {children}
    </div>
  );
}

function BookingWidgetInner({
  unitId = mockUnit.id,
  propertySlug,
  checkIn = defaultBookingWidgetProps.checkIn,
  checkOut = defaultBookingWidgetProps.checkOut,
  guestCount = defaultBookingWidgetProps.guestCount,
  currency,
  bridgeOptions,
  onEvent,
}: BookingWidgetProps & { bridgeOptions: UseIframeBridgeOptions }) {
  const client = useStorefrontClient();
  const { mockMode } = useStorefrontContext();
  const bridgeEmit = useIframeBridge(bridgeOptions, onEvent);
  const emit = useWidgetEventEmitter(bridgeEmit);

  const flow = useBookingFlow({
    client,
    mockMode,
    unitId,
    propertySlug,
    checkIn,
    checkOut,
    guestCount,
    currency,
    onEvent: emit,
  });

  const {
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
  } = flow;

  if (!catalogReady && state.loading) {
    return (
      <div data-hcp-widget="booking" data-hcp-status="loading">
        <p data-testid="widget-loading">{state.loadingMessage ?? "Loading…"}</p>
      </div>
    );
  }

  return (
    <div
      data-hcp-widget="booking"
      data-hcp-step={state.step}
      data-hcp-status={state.loading ? "loading" : "idle"}
    >
      {state.resolvedPropertyName && (
        <p data-testid="property-name">{state.resolvedPropertyName}</p>
      )}

      {state.step === "dates" && (
        <section>
          <h2>Book your stay</h2>
          {state.units.length > 1 && (
            <label>
              Unit
              <select
                value={state.unitId ?? ""}
                onChange={(e) => setUnitId(e.target.value)}
                data-testid="unit-select"
              >
                {state.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Check-in
            <input
              type="date"
              value={state.checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              data-testid="check-in"
            />
          </label>
          <label>
            Check-out
            <input
              type="date"
              value={state.checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              data-testid="check-out"
            />
          </label>
          <label>
            Guests
            <input
              type="number"
              min={1}
              value={state.guestCount}
              onChange={(e) => setGuestCount(Number(e.target.value))}
              data-testid="guest-count"
            />
          </label>
          <button
            type="button"
            onClick={checkAvailability}
            disabled={state.loading || !state.unitId}
            data-testid="check-btn"
          >
            {state.loading ? (state.loadingMessage ?? "Checking…") : "Check availability"}
          </button>
        </section>
      )}

      {state.step === "guest" && (
        <section>
          {state.total && Number(state.total) > 0 && (
            <p data-testid="price-total">
              Total: {state.total} {state.currency}
            </p>
          )}
          <label>
            Name
            <input
              value={state.guest.name}
              onChange={(e) => setGuest({ ...state.guest, name: e.target.value })}
              data-testid="guest-name"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={state.guest.email}
              onChange={(e) => setGuest({ ...state.guest, email: e.target.value })}
              data-testid="guest-email"
            />
          </label>
          <label>
            Phone (optional)
            <input
              value={state.guest.phone}
              onChange={(e) => setGuest({ ...state.guest, phone: e.target.value })}
              data-testid="guest-phone"
            />
          </label>
          <button type="button" onClick={goToConfirm} data-testid="guest-continue">
            Continue
          </button>
          <button type="button" onClick={() => setStep("dates")}>
            Back
          </button>
        </section>
      )}

      {state.step === "confirm" && (
        <section>
          {state.total && (
            <p data-testid="confirm-total">
              Total: {state.total} {state.currency}
            </p>
          )}
          <p>
            {state.guest.name} · {state.guest.email}
          </p>
          <button
            type="button"
            onClick={confirmBooking}
            disabled={state.loading}
            data-testid="confirm-btn"
          >
            {state.loading ? (state.loadingMessage ?? "Processing…") : "Confirm booking"}
          </button>
          <button type="button" onClick={() => setStep("guest")} disabled={state.loading}>
            Back
          </button>
        </section>
      )}

      {state.step === "success" && (
        <section data-testid="success-panel">
          <p data-testid="confirmation-code">Confirmation: {state.confirmationCode}</p>
          <p>Thank you! Your booking request has been received.</p>
        </section>
      )}

      {state.error && <p data-testid="widget-error">{state.error}</p>}
    </div>
  );
}

export function BookingWidget({
  publishableKey = MOCK_PUBLISHABLE_KEY,
  baseUrl,
  locale = "en-US",
  theme,
  mockMode = true,
  iframeMode,
  client,
  className,
  checkIn = defaultBookingWidgetProps.checkIn,
  checkOut = defaultBookingWidgetProps.checkOut,
  guestCount = defaultBookingWidgetProps.guestCount,
  ...rest
}: BookingWidgetProps) {
  const [iframeLocale, setIframeLocale] = useState<string | undefined>();
  const [themeOverride, setThemeOverride] = useState<Partial<ThemeConfig> | undefined>();

  const bridgeOptions: UseIframeBridgeOptions = {
    enabled: Boolean(iframeMode),
    onLocaleChange: setIframeLocale,
    onThemeChange: setThemeOverride,
  };

  const resolvedTheme = themeOverride ? { ...theme, ...themeOverride } : theme;

  return (
    <HcpStorefrontProvider
      publishableKey={publishableKey}
      baseUrl={baseUrl}
      locale={iframeLocale ?? locale}
      theme={resolvedTheme}
      mockMode={mockMode}
      client={client}
    >
      <ThemedRoot className={className} themeOverride={themeOverride}>
        <BookingWidgetInner
          publishableKey={publishableKey}
          baseUrl={baseUrl}
          locale={locale}
          theme={theme}
          mockMode={mockMode}
          iframeMode={iframeMode}
          checkIn={checkIn}
          checkOut={checkOut}
          guestCount={guestCount}
          bridgeOptions={bridgeOptions}
          {...rest}
        />
      </ThemedRoot>
    </HcpStorefrontProvider>
  );
}

export type { WidgetEvent } from "@hcp/storefront-sdk";
