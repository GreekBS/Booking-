import { it, expect, afterAll } from "vitest";
import {
  verifyRlsPoliciesActive,
  verifyCleaningLocationRlsPoliciesActive,
  verifyWebsiteBuilderRlsPoliciesActive,
  prisma,
} from "./helpers";
import { runIntegration } from "./integrationGate";


runIntegration("PostgreSQL RLS verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("has RLS enabled on tenant-scoped tables", async () => {
    expect(await verifyRlsPoliciesActive()).toBe(true);
  });

  it("has RLS enabled on CleaningLocation V1 tables", async () => {
    expect(await verifyCleaningLocationRlsPoliciesActive()).toBe(true);
  });

  it("has RLS enabled on Website Builder A1 tables", async () => {
    expect(await verifyWebsiteBuilderRlsPoliciesActive()).toBe(true);
  });
});
