import type { ThemeConfig } from "@hcp/storefront-sdk";

const IFRAME_MESSAGE_NAMESPACE = "hcp";
const IFRAME_PROTOCOL_VERSION = "1";

export type IframeChildMessageType =
  | "hcp:ready"
  | "hcp:resize"
  | "hcp:availability_checked"
  | "hcp:booking_completed"
  | "hcp:error";

export type IframeParentMessageType = "hcp:set_locale" | "hcp:set_theme";

export interface IframeChildMessage {
  type: IframeChildMessageType;
  [key: string]: unknown;
}

export interface IframeParentMessage {
  type: IframeParentMessageType;
  [key: string]: unknown;
}

interface IframeEnvelope<T> {
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

export type { ThemeConfig };
