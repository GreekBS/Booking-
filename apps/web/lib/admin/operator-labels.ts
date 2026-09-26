/**
 * Operator-facing labels for channel / admin enums.
 * Stored values are never renamed — presentation only.
 */

const CHANNEL_STATUS_LABELS: Record<string, string> = {
  draft: "Setup required",
  pending_auth: "Setup required",
  active: "Connected",
  paused: "Paused",
  error: "Attention",
  disconnected: "Disconnected",
};

const CHANNEL_PROVIDER_LABELS: Record<string, string> = {
  booking_com: "Booking.com",
  ical: "iCal",
  airbnb: "Airbnb",
  expedia: "Expedia",
};

const MEMBER_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  owner: "Owner",
};

export function channelStatusLabel(status: string): string {
  return CHANNEL_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function channelProviderLabel(provider: string): string {
  return CHANNEL_PROVIDER_LABELS[provider] ?? provider.replace(/_/g, " ");
}

export function memberRoleLabel(role: string): string {
  return MEMBER_ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}
