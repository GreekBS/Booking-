/**
 * Scoped verification: CleaningLocation V1 backfill + commercial Unit isolation.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaCleaningLocationRepository } from "../src/repositories/operations/cleaning/CleaningLocationRepository";
import { withTenantTransaction } from "../src/client";

loadEnv({ path: resolve(process.cwd(), "../../apps/web/.env.local") });

async function main() {
  const prisma = new PrismaClient();
  const locations = new PrismaCleaningLocationRepository();
  const results: string[] = [];

  try {
    const olive = await prisma.property.findFirst({
      where: { name: "Olive", deletedAt: null },
      select: { id: true, tenantId: true, name: true },
    });
    if (!olive) throw new Error("Olive property not found");

    const unitCountBefore = await prisma.unit.count({
      where: { tenantId: olive.tenantId, propertyId: olive.id, deletedAt: null },
    });
    const ratePlanCount = await prisma.ratePlan.count({
      where: { tenantId: olive.tenantId },
    });

    const oliveLocations = await locations.listActiveByProperty(
      olive.tenantId,
      olive.id,
    );
    if (oliveLocations.length < 1) {
      throw new Error("Olive should have >=1 backfilled CleaningLocation");
    }
    results.push(`PASS Olive has ${oliveLocations.length} active CleaningLocation(s)`);

    const linked = oliveLocations.filter((l) => l.commercialUnitId);
    if (linked.length < 1) {
      throw new Error("Olive location should link commercialUnitId");
    }
    results.push("PASS Olive location linked to commercial Unit");

    const execWithLocation = await prisma.cleaningExecution.count({
      where: {
        tenantId: olive.tenantId,
        propertyId: olive.id,
        cleaningLocationId: { not: null },
      },
    });
    results.push(`PASS Olive executions with locationId=${execWithLocation}`);

    // Pick a property with zero active locations for bulk test (or create isolated)
    const candidates = await prisma.property.findMany({
      where: {
        deletedAt: null,
        name: { not: "PILOT-ICAL-DO-NOT-USE" },
      },
      select: { id: true, tenantId: true, name: true },
    });

    let bulkProp = null as null | { id: string; tenantId: string; name: string };
    for (const p of candidates) {
      const n = await locations.countActiveByProperty(p.tenantId, p.id);
      if (n === 0) {
        bulkProp = p;
        break;
      }
    }

    if (!bulkProp) {
      results.push("SKIP bulk create — no empty property available");
    } else {
      const unitsBefore = await prisma.unit.count({
        where: { tenantId: bulkProp.tenantId, deletedAt: null },
      });
      const created = await locations.bulkCreate({
        tenantId: bulkProp.tenantId,
        propertyId: bulkProp.id,
        count: 5,
        actorUserId: "00000000-0000-0000-0000-000000000001",
      });
      if (created.length !== 5) throw new Error("bulk did not create 5");
      const unitsAfter = await prisma.unit.count({
        where: { tenantId: bulkProp.tenantId, deletedAt: null },
      });
      if (unitsAfter !== unitsBefore) {
        throw new Error("bulk create changed Unit count");
      }
      results.push(
        `PASS bulk 5 on ${bulkProp.name}: locations=${created.length}, units unchanged=${unitsBefore}`,
      );

      let rejected = false;
      try {
        await locations.bulkCreate({
          tenantId: bulkProp.tenantId,
          propertyId: bulkProp.id,
          count: 3,
          actorUserId: "00000000-0000-0000-0000-000000000001",
        });
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error("second bulk should reject");
      results.push("PASS second bulk rejected");

      // cleanup bulk test locations (archive)
      for (const loc of created) {
        await locations.archive({
          tenantId: bulkProp.tenantId,
          locationId: loc.id,
        });
      }
      results.push("PASS archived bulk test locations");
    }

    const unitCountAfter = await prisma.unit.count({
      where: { tenantId: olive.tenantId, propertyId: olive.id, deletedAt: null },
    });
    if (unitCountAfter !== unitCountBefore) {
      throw new Error("Olive unit count changed");
    }
    const ratePlanAfter = await prisma.ratePlan.count({
      where: { tenantId: olive.tenantId },
    });
    if (ratePlanAfter !== ratePlanCount) {
      throw new Error("Rate plan count changed");
    }
    results.push("PASS Olive Units + RatePlans unchanged");

    const board = await locations.getBoard(olive.tenantId, olive.id);
    if (board.length < 1) throw new Error("board empty for Olive");
    if (board.some((r) => "token" in r && (r as { token?: string }).token)) {
      throw new Error("board leaked QR token");
    }
    results.push(`PASS Olive board rows=${board.length} (no token leak)`);

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, results, error: String(err) }, null, 2));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
