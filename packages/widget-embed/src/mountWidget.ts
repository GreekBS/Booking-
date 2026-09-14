import type { WidgetEvent } from "@hcp/storefront-sdk";
import type { EmbedConfig } from "./embedConfig.js";

export interface MountResult {
  destroy: () => void;
}

export async function mountBookingWidget(
  container: HTMLElement,
  config: EmbedConfig,
  onEvent?: (event: WidgetEvent) => void,
): Promise<MountResult> {
  const [{ createRoot }, React, { BookingWidget }] = await Promise.all([
    import("react-dom/client"),
    import("react"),
    import("@hcp/widget-react"),
  ]);

  const root = createRoot(container);
  root.render(
    React.createElement(BookingWidget, {
      publishableKey: config.publishableKey,
      baseUrl: config.baseUrl,
      unitId: config.unitId,
      propertySlug: config.propertySlug,
      locale: config.locale,
      currency: config.currency,
      theme: config.theme,
      mockMode: config.mockMode ?? true,
      onEvent,
    }),
  );

  return {
    destroy: () => root.unmount(),
  };
}

export function resolveEmbedContainer(config: EmbedConfig): HTMLElement {
  if (config.containerId) {
    const el = document.getElementById(config.containerId);
    if (!el) {
      throw new Error(`Container #${config.containerId} not found`);
    }
    return el;
  }
  throw new Error("containerId is required for inline/modal embed modes");
}

export function createModalShell(): HTMLElement {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-hcp-modal-overlay", "true");
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:9999;";

  const panel = document.createElement("div");
  panel.setAttribute("data-hcp-modal-panel", "true");
  panel.style.cssText =
    "background:#fff;border-radius:8px;padding:16px;max-width:480px;width:100%;max-height:90vh;overflow:auto;";

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });

  return panel;
}

export function createIframeElement(config: EmbedConfig, iframeUrl: string): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.src = iframeUrl;
  iframe.title = "Booking widget";
  iframe.setAttribute("data-hcp-embed-iframe", "true");
  iframe.style.cssText = "width:100%;border:0;min-height:640px;";
  iframe.setAttribute("allow", "payment");
  return iframe;
}
