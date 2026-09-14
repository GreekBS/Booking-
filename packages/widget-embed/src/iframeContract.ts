import type { ThemeConfig } from "@hcp/storefront-sdk";

export const IFRAME_MESSAGE_NAMESPACE = "hcp" as const;
export const IFRAME_PROTOCOL_VERSION = "1";

export type IframeChildMessageType =
  | "hcp:ready"
  | "hcp:resize"
  | "hcp:availability_checked"
  | "hcp:booking_completed"
  | "hcp:error";

export type IframeParentMessageType = "hcp:set_locale" | "hcp:set_theme";

export interface IframeReadyMessage {
  type: "hcp:ready";
  version: string;
  protocolVersion: string;
}

export interface IframeResizeMessage {
  type: "hcp:resize";
  height: number;
}

export interface IframeAvailabilityMessage {
  type: "hcp:availability_checked";
  available: boolean;
  checkIn: string;
  checkOut: string;
}

export interface IframeBookingCompletedMessage {
  type: "hcp:booking_completed";
  confirmationCode: string;
  bookingId: string;
}

export interface IframeErrorMessage {
  type: "hcp:error";
  code: string;
  message: string;
}

export type IframeChildMessage =
  | IframeReadyMessage
  | IframeResizeMessage
  | IframeAvailabilityMessage
  | IframeBookingCompletedMessage
  | IframeErrorMessage;

export interface IframeSetLocaleMessage {
  type: "hcp:set_locale";
  locale: string;
}

export interface IframeSetThemeMessage {
  type: "hcp:set_theme";
  theme: Partial<ThemeConfig>;
}

export type IframeParentMessage = IframeSetLocaleMessage | IframeSetThemeMessage;

export interface IframeEnvelope<T extends IframeChildMessage | IframeParentMessage> {
  namespace: typeof IFRAME_MESSAGE_NAMESPACE;
  protocolVersion: string;
  payload: T;
}

export function wrapIframeMessage<T extends IframeChildMessage | IframeParentMessage>(
  payload: T,
): IframeEnvelope<T> {
  return {
    namespace: IFRAME_MESSAGE_NAMESPACE,
    protocolVersion: IFRAME_PROTOCOL_VERSION,
    payload,
  };
}

export function parseIframeMessage(data: unknown): IframeChildMessage | IframeParentMessage | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const envelope = data as Partial<IframeEnvelope<IframeChildMessage>>;
  if (envelope.namespace !== IFRAME_MESSAGE_NAMESPACE) {
    return null;
  }
  if (!envelope.payload || typeof envelope.payload !== "object") {
    return null;
  }
  const type = (envelope.payload as { type?: unknown }).type;
  if (typeof type !== "string" || !type.startsWith("hcp:")) {
    return null;
  }
  return envelope.payload as IframeChildMessage | IframeParentMessage;
}

export function isAllowedOrigin(origin: string, allowlist: string[]): boolean {
  return allowlist.some((allowed) => {
    if (allowed.startsWith("*.")) {
      const suffix = allowed.slice(1);
      try {
        const host = new URL(origin).hostname;
        return host.endsWith(suffix) || host === allowed.slice(2);
      } catch {
        return false;
      }
    }
    return origin === allowed || origin === `https://${allowed}` || origin === `http://${allowed}`;
  });
}

export interface IframeUrlParams {
  widgetToken?: string;
  publishableKey?: string;
  unitId: string;
  propertySlug?: string;
  locale?: string;
  theme?: string;
  mockMode?: boolean;
  baseUrl?: string;
  currency?: string;
}

export function buildIframeUrl(baseUrl: string, params: IframeUrlParams): string {
  const url = new URL(baseUrl.replace("{widgetToken}", params.widgetToken ?? "embed"));
  if (params.unitId) {
    url.searchParams.set("unit", params.unitId);
  }
  if (params.propertySlug) {
    url.searchParams.set("property", params.propertySlug);
  }
  if (params.locale) {
    url.searchParams.set("locale", params.locale);
  }
  if (params.theme) {
    url.searchParams.set("theme", params.theme);
  }
  if (params.publishableKey) {
    url.searchParams.set("key", params.publishableKey);
  }
  if (params.baseUrl) {
    url.searchParams.set("apiBase", params.baseUrl);
  }
  if (params.currency) {
    url.searchParams.set("currency", params.currency);
  }
  if (params.mockMode !== undefined) {
    url.searchParams.set("mock", params.mockMode ? "true" : "false");
  }
  return url.toString();
}
