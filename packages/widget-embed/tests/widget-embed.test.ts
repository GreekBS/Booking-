import { describe, it, expect } from "vitest";

import {

  parseEmbedAttributes,

  embedConfigFromAttributes,

  EMBED_DATA_ATTRIBUTES,

} from "../src/embedConfig.js";

import {

  wrapIframeMessage,

  parseIframeMessage,

  buildIframeUrl,

  isAllowedOrigin,

} from "../src/iframeContract.js";

import { createHcpGlobalApi, emitWidgetEvent } from "../src/initEmbed.js";

import { MOCK_PUBLISHABLE_KEY } from "@hcp/storefront-sdk";



describe("embed attributes", () => {

  it("parses data attributes from container", () => {

    const el = {

      getAttribute(name: string) {

        const map: Record<string, string> = {

          [EMBED_DATA_ATTRIBUTES.key]: MOCK_PUBLISHABLE_KEY,

          [EMBED_DATA_ATTRIBUTES.unit]: "unit-villa-entire",

          [EMBED_DATA_ATTRIBUTES.mock]: "true",

        };

        return map[name] ?? null;

      },

    };

    const attrs = parseEmbedAttributes(el);

    expect(attrs.unitId).toBe("unit-villa-entire");

    expect(embedConfigFromAttributes(attrs).mockMode).toBe(true);

  });



  it("defaults to live mode when baseUrl is set without mock attr", () => {

    const config = embedConfigFromAttributes({

      publishableKey: MOCK_PUBLISHABLE_KEY,

      baseUrl: "https://app.example.com",

      mockMode: undefined,

    });

    expect(config.mockMode).toBe(false);

  });



  it("defaults to mock mode without baseUrl", () => {

    const config = embedConfigFromAttributes({

      publishableKey: MOCK_PUBLISHABLE_KEY,

      mockMode: undefined,

    });

    expect(config.mockMode).toBe(true);

  });

});



describe("iframe postMessage contract", () => {

  it("wraps and parses child ready message", () => {

    const wrapped = wrapIframeMessage({

      type: "hcp:ready",

      version: "0.0.1",

      protocolVersion: "1",

    });

    const parsed = parseIframeMessage(wrapped);

    expect(parsed?.type).toBe("hcp:ready");

  });



  it("rejects unknown namespace", () => {

    expect(parseIframeMessage({ namespace: "other", payload: {} })).toBeNull();

  });



  it("builds iframe URL with unit, property, and locale", () => {

    const url = buildIframeUrl("https://book.hcp.example/w/embed", {

      unitId: "unit-1",

      propertySlug: "villa-1",

      locale: "el-GR",

      publishableKey: MOCK_PUBLISHABLE_KEY,

      mockMode: false,

      baseUrl: "https://api.example.com",

      currency: "EUR",

    });

    expect(url).toContain("unit=unit-1");

    expect(url).toContain("property=villa-1");

    expect(url).toContain("locale=el-GR");

    expect(url).toContain("mock=false");

  });



  it("validates allowed origins", () => {

    expect(isAllowedOrigin("https://app.example.com", ["*.example.com"])).toBe(true);

    expect(isAllowedOrigin("https://evil.com", ["*.example.com"])).toBe(false);

  });

});



describe("global embed API", () => {

  it("initializes mock iframe mode", () => {

    const api = createHcpGlobalApi();

    const events: string[] = [];

    api.on("ready", () => events.push("ready"));

    const result = api.init({

      publishableKey: MOCK_PUBLISHABLE_KEY,

      unitId: "unit-villa-entire",

      mode: "iframe",

      mockMode: true,

      iframeBaseUrl: "https://book.hcp.example/w/embed",

    });

    expect(result.iframeUrl).toContain("unit=unit-villa-entire");

    expect(events).toContain("ready");

  });



  it("dispatches widget events to listeners", () => {

    const received: string[] = [];

    const api = createHcpGlobalApi();

    api.on("booking_completed", (e) => {

      if (e.type === "booking_completed") {

        received.push(e.confirmationCode);

      }

    });

    emitWidgetEvent({

      type: "booking_completed",

      confirmationCode: "HCP-ABC",

      bookingId: "booking_1",

    });

    expect(received).toEqual(["HCP-ABC"]);

  });

});



describe("embed initialization", () => {

  it("requires publishable key prefix", () => {

    const api = createHcpGlobalApi();

    expect(() =>

      api.init({ publishableKey: "invalid", containerId: "x" }),

    ).toThrow(/publishable key/i);

  });

});


