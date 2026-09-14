"use client";

import { BookingWidget } from "@hcp/widget-react";
import {
  createHcpGlobalApi,
  parseIframeMessage,
  wrapIframeMessage,
} from "@hcp/widget-embed";
import {
  MOCK_PUBLISHABLE_KEY,
  mockProperty,
  mockUnit,
} from "@hcp/storefront-sdk";
import { useEffect, useMemo, useState } from "react";
import type { WidgetEvent } from "@hcp/storefront-sdk";

export default function WidgetEmbedPreviewPage() {
  const [embedLog, setEmbedLog] = useState<string[]>([]);
  const [iframeMessages, setIframeMessages] = useState<string[]>([]);

  const iframeSrc = useMemo(() => {
    if (typeof window === "undefined") return "/dev/widget-iframe";
    return `${window.location.origin}/dev/widget-iframe`;
  }, []);

  useEffect(() => {
    const api = createHcpGlobalApi();
    const unsub = api.on("*", (event: WidgetEvent) => {
      setEmbedLog((prev) => [`[HCP] ${event.type}`, ...prev].slice(0, 6));
    });
    api.init({
      publishableKey: MOCK_PUBLISHABLE_KEY,
      unitId: mockUnit.id,
      mode: "inline",
      mockMode: true,
      locale: "en-US",
    });

    function onMessage(event: MessageEvent) {
      const parsed = parseIframeMessage(event.data);
      if (parsed) {
        setIframeMessages((prev) =>
          [`[iframe] ${parsed.type}`, ...prev].slice(0, 6),
        );
      }
    }
    window.addEventListener("message", onMessage);

    return () => {
      unsub();
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    const iframe = document.getElementById("hcp-preview-iframe") as HTMLIFrameElement | null;
    if (!iframe?.contentWindow) return;
    const timer = window.setTimeout(() => {
      iframe.contentWindow?.postMessage(
        wrapIframeMessage({ type: "hcp:set_locale", locale: "en-US" }),
        window.location.origin,
      );
    }, 500);
    return () => window.clearTimeout(timer);
  }, [iframeSrc]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Embed / iframe mock</h1>
        <p className="mt-1 text-gray-600">
          Simulates <code>window.HCP</code> init + local iframe hosting{" "}
          {mockProperty.name}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Inline embed (same mock widget)</h2>
        <div
          id="hcp-booking"
          className="rounded-lg border border-gray-200 bg-white p-4"
        >
          <BookingWidget
            publishableKey={MOCK_PUBLISHABLE_KEY}
            unitId={mockUnit.id}
            mockMode
          />
        </div>
        <pre className="rounded bg-gray-100 p-2 text-xs">{embedLog.join("\n") || "HCP API ready"}</pre>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">iframe fallback</h2>
        <iframe
          id="hcp-preview-iframe"
          src={iframeSrc}
          title="HCP booking widget iframe preview"
          className="w-full rounded border border-gray-300"
          height={680}
          allow="payment"
        />
        <pre className="rounded bg-gray-100 p-2 text-xs">
          {iframeMessages.join("\n") || "Listening for postMessage…"}
        </pre>
      </section>
    </div>
  );
}
