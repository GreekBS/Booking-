import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * L: Existing internal HTTP worker endpoints remain unchanged as ops surfaces.
 * The always-on worker must not replace or rewrite these routes.
 */
describe("internal HTTP worker endpoints unchanged", () => {
  const webRoot = resolve(import.meta.dirname, "../../web");

  it("keeps POST /api/internal/v1/jobs/run", () => {
    const source = readFileSync(
      resolve(webRoot, "app/api/internal/v1/jobs/run/route.ts"),
      "utf8",
    );
    expect(source).toContain("processJobBatchUseCase");
    expect(source).toContain("BACKGROUND_JOBS_SECRET");
    expect(source).toContain("export async function POST");
  });

  it("keeps POST /api/internal/v1/outbox/dispatch", () => {
    const source = readFileSync(
      resolve(webRoot, "app/api/internal/v1/outbox/dispatch/route.ts"),
      "utf8",
    );
    expect(source).toContain("processOutboxBatchUseCase");
    expect(source).toContain("OUTBOX_DISPATCH_SECRET");
    expect(source).toContain("export async function POST");
  });

  it("keeps POST /api/internal/v1/channels/schedule-ical-polls", () => {
    const source = readFileSync(
      resolve(webRoot, "app/api/internal/v1/channels/schedule-ical-polls/route.ts"),
      "utf8",
    );
    expect(source).toContain("export async function POST");
    expect(source).toContain("BACKGROUND_JOBS_SECRET");
  });
});
