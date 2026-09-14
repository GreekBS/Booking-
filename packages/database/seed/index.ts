import { prisma } from "../src/client";
import { seedDevDemoTenant } from "./devDemoTenant.js";
import { seedDevSuperAdmin } from "./devSuperAdmin.js";

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
