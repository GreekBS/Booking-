"use client";

import {
  createHcpGlobalApi,
  parseEmbedAttributes,
  embedConfigFromAttributes,
  EMBED_DATA_ATTRIBUTES,
} from "@hcp/widget-embed";
import {
  LIVE_PROPERTY_SLUG,
  LIVE_STOREFRONT_KEY,
  LIVE_UNIT_ID,
  livePreviewBaseUrl,
} from "@/lib/storefront/live-preview-config";
import { useEffect, useState } from "react";
import type { WidgetEvent } from "@hcp/storefront-sdk";

export default function EmbedLivePreviewPage() {
  const [embedLog, setEmbedLog] = useState<string[]>([]);
  const baseUrl = livePreviewBaseUrl();

  useEffect(() => {
    const api = createHcpGlobalApi();
    const unsub = api.on("*", (event: WidgetEvent) => {
      setEmbedLog((prev) => [`[HCP] ${event.type}`, ...prev].slice(0, 8));
    });

    const config = {
      publishableKey: LIVE_STOREFRONT_KEY,
      unitId: LIVE_UNIT_ID || undefined,
      propertySlug: LIVE_PROPERTY_SLUG || undefined,
      mode: "inline" as const,
      mockMode: false,
      baseUrl,
      locale: "en-US",
      currency: "EUR",
      containerId: "hcp-live-booking",
    };
    api.init(config);

    return unsub;
  }, [baseUrl]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Embed script (live API)</h1>
        <p className="mt-1 text-gray-600">
          <code>window.HCP.init</code> mounting into <code>#hcp-live-booking</code>
        </p>
      </div>

      <section className="rounded bg-gray-100 p-4 text-sm">
        <p className="font-medium">Script tag example</p>
        <pre className="mt-2 overflow-x-auto text-xs">{`<div id="hcp-live-booking"></div>
<script
  src="/hcp-embed.js"
  ${EMBED_DATA_ATTRIBUTES.key}="${LIVE_STOREFRONT_KEY}"
  ${EMBED_DATA_ATTRIBUTES.baseUrl}="${baseUrl}"
  ${EMBED_DATA_ATTRIBUTES.container}="hcp-live-booking"
  ${EMBED_DATA_ATTRIBUTES.property}="${LIVE_PROPERTY_SLUG || "your-property-slug"}"
  ${EMBED_DATA_ATTRIBUTES.locale}="en-US"
  ${EMBED_DATA_ATTRIBUTES.currency}="EUR"
></script>`}</pre>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Mounted widget</h2>
        <div
          id="hcp-live-booking"
          className="rounded-lg border border-emerald-200 bg-white p-4"
        />
        <pre className="rounded bg-gray-100 p-2 text-xs">{embedLog.join("\n") || "HCP API ready"}</pre>
      </section>

      <section className="text-sm text-gray-600">
        <p>
          Attribute parser demo:{" "}
          {JSON.stringify(
            embedConfigFromAttributes(
              parseEmbedAttributes({
                getAttribute(name: string) {
                  const map: Record<string, string> = {
                    [EMBED_DATA_ATTRIBUTES.key]: LIVE_STOREFRONT_KEY,
                    [EMBED_DATA_ATTRIBUTES.baseUrl]: baseUrl,
                    [EMBED_DATA_ATTRIBUTES.property]: LIVE_PROPERTY_SLUG,
                  };
                  return map[name] ?? null;
                },
              }),
            ).mockMode,
          )}{" "}
          (mockMode=false when baseUrl set)
        </p>
      </section>
    </div>
  );
}
