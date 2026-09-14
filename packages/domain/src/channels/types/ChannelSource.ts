export type ChannelSource =
  | "direct"
  | "manual"
  | "booking_com"
  | "airbnb"
  | "vrbo"
  | "expedia"
  | "google_vacation_rentals"
  | "ical";

export const CHANNEL_SOURCES: readonly ChannelSource[] = [
  "direct",
  "manual",
  "booking_com",
  "airbnb",
  "vrbo",
  "expedia",
  "google_vacation_rentals",
  "ical",
] as const;
