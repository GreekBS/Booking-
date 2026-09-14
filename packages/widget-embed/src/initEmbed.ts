import type { WidgetEvent, WidgetEventType } from "@hcp/storefront-sdk";
import type { EmbedConfig } from "./embedConfig.js";
import { embedConfigFromAttributes, parseEmbedAttributes } from "./embedConfig.js";
import { emitWidgetEvent, subscribeWidgetEvent } from "./eventBus.js";
import { buildIframeUrl } from "./iframeContract.js";
import {
  createIframeElement,
  createModalShell,
  mountBookingWidget,
  resolveEmbedContainer,
} from "./mountWidget.js";

export type EmbedEventHandler = (event: WidgetEvent) => void;

export interface HcpGlobalApi {
  init(config: EmbedConfig): EmbedInitResult;
  on(type: WidgetEventType | "*", handler: EmbedEventHandler): () => void;
  version: string;
}

export interface EmbedInitResult {
  mode: EmbedConfig["mode"];
  mockMode: boolean;
  iframeUrl?: string;
  destroy: () => void;
}

export function createHcpGlobalApi(): HcpGlobalApi {
  return {
    version: "0.0.1",
    init(config: EmbedConfig): EmbedInitResult {
      if (!config.publishableKey.startsWith("pk_")) {
        throw new Error("A valid publishable key (pk_test_ / pk_live_) is required");
      }

      const mode = config.mode ?? "inline";
      const mockMode = config.mockMode ?? !config.baseUrl;
      const destroyFns: Array<() => void> = [];
      let iframeUrl: string | undefined;

      if (mode === "iframe") {
        if (!config.unitId && !config.propertySlug) {
          throw new Error("unitId or propertySlug is required for iframe mode");
        }
        const base =
          config.iframeBaseUrl ??
          (config.baseUrl
            ? `${config.baseUrl.replace(/\/$/, "")}/w/embed`
            : "/w/embed");
        iframeUrl = buildIframeUrl(base, {
          unitId: config.unitId ?? "",
          propertySlug: config.propertySlug,
          locale: config.locale,
          publishableKey: config.publishableKey,
          theme: config.theme ? JSON.stringify(config.theme) : undefined,
          mockMode,
          baseUrl: config.baseUrl,
          currency: config.currency,
        });

        const container = config.containerId
          ? document.getElementById(config.containerId)
          : null;
        if (container) {
          const iframe = createIframeElement(config, iframeUrl);
          container.appendChild(iframe);
          destroyFns.push(() => iframe.remove());
        }
      } else {
        const container =
          mode === "modal" ? createModalShell() : resolveEmbedContainer(config);
        let mounted: { destroy: () => void } | null = null;
        void mountBookingWidget(container, { ...config, mockMode }, emitWidgetEvent).then(
          (result) => {
            mounted = result;
          },
        );
        destroyFns.push(() => mounted?.destroy());
        if (mode === "modal") {
          destroyFns.push(() => container.parentElement?.remove());
        }
      }

      const destroy = () => {
        destroyFns.forEach((fn) => fn());
        destroyFns.length = 0;
      };

      emitWidgetEvent({ type: "ready", version: "0.0.1" });
      return { mode, mockMode, iframeUrl, destroy };
    },
    on(type, handler) {
      return subscribeWidgetEvent(type, handler);
    },
  };
}

export function initEmbed(config: EmbedConfig): EmbedInitResult {
  return createHcpGlobalApi().init(config);
}

declare global {
  interface Window {
    HCP?: HcpGlobalApi;
  }
}

export function registerGlobalApi(api: HcpGlobalApi = createHcpGlobalApi()): void {
  if (typeof globalThis !== "undefined" && "window" in globalThis) {
    (globalThis as typeof globalThis & { window: Window }).window.HCP = api;
  }
}

export function bootstrapFromCurrentScript(): EmbedInitResult | null {
  if (typeof document === "undefined") {
    return null;
  }
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) {
    return null;
  }
  const attrs = parseEmbedAttributes(script);
  const config = embedConfigFromAttributes(attrs);
  if (!config.baseUrl && typeof window !== "undefined") {
    config.baseUrl = window.location.origin;
  }
  registerGlobalApi();
  return window.HCP!.init(config);
}

export { emitWidgetEvent } from "./eventBus.js";
