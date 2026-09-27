/**
 * Authorized one-shot: ensure the built-in default cleaning checklist for any
 * Property that still has no ACTIVE template. Never overwrites existing checklists.
 *
 * Usage (from repo root):
 *   pnpm --filter @hcp/database exec tsx scripts/ensure-default-cleaning-checklists.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaCleaningChecklistRepository } from "../src/repositories/operations/cleaning/CleaningChecklistRepository";
import { DEFAULT_CLEANING_CHECKLIST_ITEMS } from "@hcp/domain";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });
loadEnv({ path: resolve(root, "../.env") });

async function main() {
  const url =
    process.env.MIGRATION_DIRECT_URL ||
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL required");

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const checklists = new PrismaCleaningChecklistRepository();

  try {
    const properties = await prisma.property.findMany({
      where: {
        deletedAt: null,
        // Never seed the reserved iCal pilot property.
        name: { not: "PILOT-ICAL-DO-NOT-USE" },
      },
      select: { id: true, tenantId: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    const summary: Array<{
      propertyId: string;
      name: string;
      action: "created" | "unchanged";
      activeItems: number;
    }> = [];

    for (const property of properties) {
      const before = await checklists.findActiveTemplateByProperty(
        property.tenantId,
        property.id,
      );
      if (before) {
        summary.push({
          propertyId: property.id,
          name: property.name,
          action: "unchanged",
          activeItems: before.items.filter((i) => i.isActive).length,
        });
        continue;
      }

      const ensured = await checklists.ensureDefaultActiveTemplate({
        tenantId: property.tenantId,
        propertyId: property.id,
        actorUserId: "system:ensure-default-cleaning-checklists",
      });

      // Idempotency smoke: second call must not create another ACTIVE template.
      const again = await checklists.ensureDefaultActiveTemplate({
        tenantId: property.tenantId,
        propertyId: property.id,
        actorUserId: "system:ensure-default-cleaning-checklists",
      });
      if (again.created || again.template.id !== ensured.template.id) {
        throw new Error(`idempotency failed for property ${property.id}`);
      }
      if (
        ensured.template.items.filter((i) => i.isActive).length !==
        DEFAULT_CLEANING_CHECKLIST_ITEMS.length
      ) {
        throw new Error(`unexpected item count for property ${property.id}`);
      }

      summary.push({
        propertyId: property.id,
        name: property.name,
        action: "created",
        activeItems: ensured.template.items.filter((i) => i.isActive).length,
      });
    }

    const created = summary.filter((row) => row.action === "created").length;
    const unchanged = summary.filter((row) => row.action === "unchanged").length;
    console.log(
      JSON.stringify(
        {
          ok: true,
          properties: properties.length,
          created,
          unchanged,
          expectedDefaultItems: DEFAULT_CLEANING_CHECKLIST_ITEMS.length,
          summary,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
