import { describe, expect, it } from "vitest";
import {
  checkLeadRateLimit,
  resetLeadRateLimitForTests,
} from "../lib/marketing/lead-rate-limit";
import { RateLimitedError } from "../lib/channels/channel-transport-rate-limit";

describe("checkLeadRateLimit", () => {
  it("throws RateLimitedError after repeated submissions from one IP", () => {
    resetLeadRateLimitForTests();
    const req = new Request("http://localhost/api/marketing/v1/leads", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    for (let i = 0; i < 8; i++) {
      checkLeadRateLimit(req);
    }
    expect(() => checkLeadRateLimit(req)).toThrow(RateLimitedError);
  });
});
