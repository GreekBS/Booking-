/**
 * Development/demo seed entrypoint.
 *
 * Callers (as of Phase E):
 * - local development: `pnpm db:seed` / `pnpm --filter @hcp/database db:seed`
 * - documentation: README setup
 * - NOT wired as Prisma `prisma db seed`, CI, Vercel, or test setup
 *
 * This is NOT production Super Admin bootstrap. Platform authority for the
 * local `admin@hcp.local` account requires ALLOW_DEV_SUPER_ADMIN_SEED=true.
 *
 * Refuses Talos Production targets unless ALLOW_TALOS_PRODUCTION_DB_MUTATION=true
 * (that override is for controlled ops only — never for routine seeding).
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/client";
import { assertNotTalosProductionDatabase } from "../src/safety/databaseTargetGuard.js";
import { seedDevDemoTenant } from "./devDemoTenant.js";
import { seedDevSuperAdmin } from "./devSuperAdmin.js";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const SYSTEM_AMENITIES = [
  { name: "WiFi", icon: "wifi", category: "general" },
  { name: "Air Conditioning", icon: "ac", category: "general" },
  { name: "Pool", icon: "pool", category: "outdoor" },
  { name: "Sea View", icon: "sea-view", category: "view" },
  { name: "Parking", icon: "parking", category: "general" },
  { name: "Kitchen", icon: "kitchen", category: "general" },
  { name: "Washing Machine", icon: "washing-machine", category: "general" },
  { name: "BBQ", icon: "bbq", category: "outdoor" },
  { name: "Garden", icon: "garden", category: "outdoor" },
  { name: "Hot Tub", icon: "hot-tub", category: "outdoor" },
];

async function seedSystemAmenities(): Promise<void> {
  for (const amenity of SYSTEM_AMENITIES) {
    const existing = await prisma.amenity.findFirst({
      where: { tenantId: null, name: amenity.name },
    });
    if (!existing) {
      await prisma.amenity.create({
        data: { tenantId: null, ...amenity },
      });
    }
  }
  console.log("System amenities seeded");
}

async function main(): Promise<void> {
  assertNotTalosProductionDatabase(process.env.DATABASE_URL, "db:seed");
  if (process.env.DIRECT_URL) {
    assertNotTalosProductionDatabase(process.env.DIRECT_URL, "db:seed (DIRECT_URL)");
  }
  await seedSystemAmenities();
  await seedDevDemoTenant();
  await seedDevSuperAdmin();
  console.log("Seed completed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
