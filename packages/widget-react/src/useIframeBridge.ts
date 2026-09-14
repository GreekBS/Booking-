import { useEffect, useRef } from "react";
import type { ThemeConfig, WidgetEvent } from "@hcp/storefront-sdk";
import {
  isAllowedOrigin,
  parseIframeMessage,
  wrapIframeMessage,
  type IframeChildMessage,
} from "./iframePostMessage.js";

export interface UseIframeBridgeOptions {
  enabled?: boolean;
  allowedOrigins?: string[];
  onLocaleChange?: (locale: string) => void;
  onThemeChange?: (theme: Partial<ThemeConfig>) => void;
}

function widgetEventToIframeMessage(event: WidgetEvent): IframeChildMessage | null {
  switch (event.type) {
    case "ready":
      return {
        type: "hcp:ready",
        version: event.version,
        protocolVersion: "1",
      };
    case "booking_completed":
      return {
        type: "hcp:booking_completed",
        confirmationCode: event.confirmationCode,
        bookingId: event.bookingId,
      };
    case "error":
      return {
        type: "hcp:error",
        code: event.code,
        message: event.message,
      };
    default:
      return null;
  }
}

export function useIframeBridge(
  options: UseIframeBridgeOptions,
  onWidgetEvent?: (event: WidgetEvent) => void,
): (event: WidgetEvent) => void {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastDatesRef = useRef({ checkIn: "", checkOut: "" });

  useEffect(() => {
    if (!options.enabled || typeof window === "undefined") {
      return;
    }

    function handleParentMessage(event: MessageEvent) {
      const allowed = optionsRef.current.allowedOrigins;
      if (allowed && allowed.length > 0) {
        if (!isAllowedOrigin(event.origin, allowed)) {
          return;
        }
      } else if (event.origin !== window.location.origin) {
        return;
      }

      const parsed = parseIframeMessage(event.data);
      if (!parsed) return;

      if (parsed.type === "hcp:set_locale" && typeof parsed.locale === "string") {
        optionsRef.current.onLocaleChange?.(parsed.locale);
      }
      if (parsed.type === "hcp:set_theme" && parsed.theme) {
        optionsRef.current.onThemeChange?.(parsed.theme as Partial<ThemeConfig>);
      }
    }

    window.addEventListener("message", handleParentMessage);

    const root = document.querySelector("[data-hcp-widget-root]");
    let resizeObserver: ResizeObserver | undefined;
    if (root && "ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        window.parent.postMessage(
          wrapIframeMessage({
            type: "hcp:resize",
            height: Math.ceil(root.getBoundingClientRect().height),
          }),
          "*",
        );
      });
      resizeObserver.observe(root);
    }

    return () => {
      window.removeEventListener("message", handleParentMessage);
      resizeObserver?.disconnect();
    };
  }, [options.enabled]);

  return (event: WidgetEvent) => {
    onWidgetEvent?.(event);
    if (event.type === "dates_selected") {
      lastDatesRef.current = { checkIn: event.checkIn, checkOut: event.checkOut };
    }
    if (!options.enabled || typeof window === "undefined" || window.parent === window) {
      return;
    }
    const iframeMessage = widgetEventToIframeMessage(event);
    if (iframeMessage) {
      window.parent.postMessage(wrapIframeMessage(iframeMessage), "*");
    }
    if (event.type === "availability_checked") {
      window.parent.postMessage(
        wrapIframeMessage({
          type: "hcp:availability_checked",
          available: event.available,
          checkIn: lastDatesRef.current.checkIn,
          checkOut: lastDatesRef.current.checkOut,
        }),
        "*",
      );
    }
  };
}

