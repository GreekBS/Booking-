import type { WidgetEvent, ThemeConfig, IStorefrontClient } from "@hcp/storefront-sdk";

export type BookingWidgetMode = "inline" | "modal";

export interface BookingWidgetProps {
  unitId?: string;
  propertySlug?: string;
  mode?: BookingWidgetMode;
  locale?: string;
  theme?: Partial<ThemeConfig>;
  mockMode?: boolean;
  publishableKey?: string;
  baseUrl?: string;
  currency?: string;
  iframeMode?: boolean;
  client?: IStorefrontClient;
  checkIn?: string;
  checkOut?: string;
  guestCount?: number;
  onEvent?: (event: WidgetEvent) => void;
  className?: string;
}

export const defaultBookingWidgetProps: Required<
  Pick<BookingWidgetProps, "mode" | "mockMode" | "guestCount" | "checkIn" | "checkOut">
> = {
  mode: "inline",
  mockMode: true,
  guestCount: 2,
  checkIn: "2025-08-01",
  checkOut: "2025-08-04",
};

export type { WidgetEvent };
