/** Live storefront preview defaults (seed via integration fixtures). */
export const LIVE_STOREFRONT_KEY =
  process.env.NEXT_PUBLIC_STOREFRONT_PUBLISHABLE_KEY ??
  "pk_test_abcdefghijklmnop1234";

export const LIVE_PROPERTY_SLUG =
  process.env.NEXT_PUBLIC_STOREFRONT_PROPERTY_SLUG ?? "";

export const LIVE_UNIT_ID = process.env.NEXT_PUBLIC_STOREFRONT_UNIT_ID ?? "";

export function livePreviewBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
