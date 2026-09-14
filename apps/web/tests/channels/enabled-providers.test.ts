import { describe, expect, it } from "vitest";
import {
  ChannelProviderRegistry,
  ValidationError,
  type ChannelProviderRegistration,
} from "@hcp/domain";
import {
  PRODUCTION_CHANNEL_PROVIDER_FACTORIES,
  bootstrapChannelProviderRegistry,
  createProductionChannelProviderRegistry,
  parseChannelsEnabledProviders,
} from "@/lib/channels/enabled-providers";

describe("CHANNELS_ENABLED_PROVIDERS bootstrap (S4a-2a / P1-S1)", () => {
  it("missing env → empty list", () => {
    expect(parseChannelsEnabledProviders(undefined)).toEqual([]);
    expect(parseChannelsEnabledProviders(null)).toEqual([]);
  });

  it("empty env → empty list", () => {
    expect(parseChannelsEnabledProviders("")).toEqual([]);
  });

  it("whitespace-only env → empty list", () => {
    expect(parseChannelsEnabledProviders("   ")).toEqual([]);
    expect(parseChannelsEnabledProviders(" , , ")).toEqual([]);
  });

  it("trims comma-separated entries", () => {
    expect(parseChannelsEnabledProviders("  a , b,c  ")).toEqual(["a", "b", "c"]);
  });

  it("preserves case sensitivity", () => {
    expect(parseChannelsEnabledProviders("BookingCom,bookingcom")).toEqual([
      "BookingCom",
      "bookingcom",
    ]);
  });

  it("rejects duplicate provider IDs", () => {
    expect(() => parseChannelsEnabledProviders("ical,ical")).toThrow(ValidationError);
    expect(() => parseChannelsEnabledProviders("ical, ical ")).toThrow(/Duplicate/);
  });

  it("rejects unknown provider IDs (fail closed)", () => {
    const registry = new ChannelProviderRegistry();
    expect(() =>
      bootstrapChannelProviderRegistry(
        registry,
        ["not_a_real_provider"],
        PRODUCTION_CHANNEL_PROVIDER_FACTORIES,
      ),
    ).toThrow(ValidationError);
    expect(() =>
      bootstrapChannelProviderRegistry(
        registry,
        ["not_a_real_provider"],
        PRODUCTION_CHANNEL_PROVIDER_FACTORIES,
      ),
    ).toThrow(/Unknown CHANNELS_ENABLED_PROVIDERS/);
    expect(registry.list()).toHaveLength(0);
  });

  it("registers known factories when provided (test-only map)", () => {
    const registry = new ChannelProviderRegistry();
    const fakeRegistration = {
      providerId: "manual" as const,
      status: "active" as const,
      capabilities: {
        connectionAuth: false,
        inbound: {
          webhooks: false,
          polling: false,
          reservationImport: false,
        },
        core: {
          availabilityExport: false,
          rateExport: false,
          restrictionExport: false,
        },
        optional: {
          reservationExport: false,
          reservationExportOperations: [],
        },
      },
      auth: null,
      webhooks: null,
      polling: null,
      reservationImport: null,
      availabilityExport: null,
      rateRestrictionExport: null,
      reservationExport: null,
    };

    bootstrapChannelProviderRegistry(registry, ["manual"], {
      manual: () => fakeRegistration as ChannelProviderRegistration,
    });
    expect(registry.list()).toHaveLength(1);
    expect(registry.get("manual")?.providerId).toBe("manual");
  });

  it("production factory catalog contains only ical (factory ≠ registration)", () => {
    expect(Object.keys(PRODUCTION_CHANNEL_PROVIDER_FACTORIES)).toEqual(["ical"]);
    expect(typeof PRODUCTION_CHANNEL_PROVIDER_FACTORIES.ical).toBe("function");
  });

  it("createProductionChannelProviderRegistry yields empty registry for default env", () => {
    const registry = createProductionChannelProviderRegistry({});
    expect(registry.list()).toHaveLength(0);
  });

  it("empty CHANNELS_ENABLED_PROVIDERS still yields empty live registry", () => {
    const registry = createProductionChannelProviderRegistry({
      CHANNELS_ENABLED_PROVIDERS: "",
    });
    expect(registry.list()).toHaveLength(0);
  });

  it("CHANNELS_ENABLED_PROVIDERS=ical registers one iCal provider", async () => {
    const registry = createProductionChannelProviderRegistry({
      CHANNELS_ENABLED_PROVIDERS: "ical",
    });
    expect(registry.list()).toHaveLength(1);
    expect(registry.get("ical")?.providerId).toBe("ical");
    expect(registry.get("ical")?.status).toBe("active");
    const polling = registry.resolvePolling("ical");
    expect(polling).not.toBeNull();
    await expect(polling!.poll("conn-1", null, {})).rejects.toMatchObject({
      name: "ValidationError",
    });
  });

  it("createProductionChannelProviderRegistry fails on unknown allow-list entry", () => {
    expect(() =>
      createProductionChannelProviderRegistry({
        CHANNELS_ENABLED_PROVIDERS: "not_a_real_provider",
      }),
    ).toThrow(ValidationError);
  });

  it("registry construction is deterministic for the same allow-list", () => {
    const a = createProductionChannelProviderRegistry({
      CHANNELS_ENABLED_PROVIDERS: "ical",
    });
    const b = createProductionChannelProviderRegistry({
      CHANNELS_ENABLED_PROVIDERS: "ical",
    });
    expect(a.list().map((r) => r.providerId)).toEqual(b.list().map((r) => r.providerId));
    expect(a.get("ical")?.capabilities).toEqual(b.get("ical")?.capabilities);
  });
});
