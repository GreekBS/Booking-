import { describe, it, expect, afterAll } from "vitest";
import { verifyRlsPoliciesActive, prisma } from "./helpers";
import { runIntegration } from "./integrationGate";


runIntegration("PostgreSQL RLS verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("has RLS enabled on tenant-scoped tables", async () => {
    expect(await verifyRlsPoliciesActive()).toBe(true);
  });
});
