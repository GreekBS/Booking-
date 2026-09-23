/**
 * CM-4c-5 — Booking.com operator transport policy.
 * Live Booking.com remains OFF. Fixture transport is local/test only.
 */

export function isBookingComFixtureTransportEnabled(
  env: NodeJS.Dict<string | undefined> = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.CHANNELS_BOOKING_COM_FIXTURE_TRANSPORT === "true";
}

export function getBookingComPartnerAccessStatus(
  env: NodeJS.Dict<string | undefined> = process.env,
): {
  liveConnectivityAvailable: boolean;
  fixtureTransportEnabled: boolean;
  operatorMessage: string;
} {
  const fixtureTransportEnabled = isBookingComFixtureTransportEnabled(env);
  return {
    liveConnectivityAvailable: false,
    fixtureTransportEnabled,
    operatorMessage: fixtureTransportEnabled
      ? "Local fixture transport is enabled for setup rehearsal. This is not a live Booking.com connection."
      : "Booking.com connectivity is being prepared for partner activation. Live connection is not available yet.",
  };
}
