import { describe, it, expect, afterAll } from "vitest";
import { verifyRlsPoliciesActive, prisma } from "./helpers";

const runIntegration = process.env.DATABASE_URL ? describe : describe.skip;

runIntegration("PostgreSQL RLS verification", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("has RLS enabled on tenant-scoped tables", async () => {
    expect(await verifyRlsPoliciesActive()).toBe(true);
  });
});
