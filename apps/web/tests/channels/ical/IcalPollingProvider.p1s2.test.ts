import { describe, expect, it, vi } from "vitest";
import {
  IcalPollingProvider,
  createIcalProviderRegistration,
  type IIcalFeedFetcher,
} from "@hcp/domain";

describe("IcalPollingProvider fetch boundary (P1-S2 / P1-S5)", () => {
  it("does not call fetcher without feedUrl credential material", async () => {
    const fetchSpy = vi.fn<IIcalFeedFetcher["fetch"]>();
    const provider = new IcalPollingProvider({ fetch: fetchSpy });

    await expect(provider.poll("conn-1", null, {})).rejects.toMatchObject({
      name: "ValidationError",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("registration factory requires injected IIcalFeedFetcher", async () => {
    const fetchSpy = vi.fn<IIcalFeedFetcher["fetch"]>().mockResolvedValue({
      body: new TextEncoder().encode(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR",
      ),
      contentType: "text/calendar",
    });
    const registration = createIcalProviderRegistration({ feedFetcher: { fetch: fetchSpy } });
    expect(registration.polling).toBeInstanceOf(IcalPollingProvider);
    await registration.polling!.poll("conn-1", null, {
      credentialMaterial: { feedUrl: "https://calendar.example.com/feed.ics" },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
