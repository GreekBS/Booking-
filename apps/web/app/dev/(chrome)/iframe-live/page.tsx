"use client";

import { buildIframeUrl, parseIframeMessage, wrapIframeMessage } from "@hcp/widget-embed";
import {
  LIVE_PROPERTY_SLUG,
  LIVE_STOREFRONT_KEY,
  LIVE_UNIT_ID,
  livePreviewBaseUrl,
} from "@/lib/storefront/live-preview-config";
import { useEffect, useMemo, useState } from "react";

export default function IframeLivePreviewPage() {
  const [messages, setMessages] = useState<string[]>([]);
  const baseUrl = livePreviewBaseUrl();

  const iframeSrc = useMemo(() => {
    return buildIframeUrl(`${baseUrl}/w/embed`, {
      unitId: LIVE_UNIT_ID,
      propertySlug: LIVE_PROPERTY_SLUG || undefined,
      locale: "en-US",
      publishableKey: LIVE_STOREFRONT_KEY,
      mockMode: false,
      baseUrl,
      currency: "EUR",
    });
  }, [baseUrl]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const parsed = parseIframeMessage(event.data);
      if (parsed) {
        setMessages((prev) => [`[iframe] ${parsed.type}`, ...prev].slice(0, 10));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const iframe = document.getElementById("hcp-live-iframe") as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return;
    const timer = window.setTimeout(() => {
      iframe.contentWindow?.postMessage(
        wrapIframeMessage({ type: "hcp:set_locale", locale: "en-US" }),
        window.location.origin,
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [iframeSrc]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">iframe embed (live API)</h1>
        <p className="mt-1 text-gray-600">
          Parent page listening for <code>hcp:*</code> postMessage events from hosted widget.
        </p>
      </div>

      <iframe
        id="hcp-live-iframe"
        src={iframeSrc}
        title="HCP live booking iframe"
        className="w-full rounded border border-emerald-300"
        height={720}
        allow="payment"
      />

      <pre className="rounded bg-gray-900 p-3 text-xs text-green-300">
        {messages.length === 0 ? "Listening for postMessage…" : messages.join("\n")}
      </pre>
    </div>
  );
}
