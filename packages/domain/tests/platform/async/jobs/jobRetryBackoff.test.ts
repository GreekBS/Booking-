import { describe, it, expect } from "vitest";
import { computeNextRetryAt } from "../../../../src/platform/async/jobs/application/jobRetryBackoff";

describe("computeNextRetryAt", () => {
  it("applies exponential backoff capped at 15 minutes", () => {
    const base = new Date("2027-01-01T00:00:00.000Z");

    expect(computeNextRetryAt(1, base).toISOString()).toBe("2027-01-01T00:00:30.000Z");
    expect(computeNextRetryAt(2, base).toISOString()).toBe("2027-01-01T00:01:00.000Z");
    expect(computeNextRetryAt(10, base).toISOString()).toBe("2027-01-01T00:15:00.000Z");
  });
});
