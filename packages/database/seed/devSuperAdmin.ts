import { prisma } from "../src/client.js";
import { hashPassword } from "./passwordHasher.js";
import { DEV_DEMO_TENANT_SLUG } from "./devDemoTenant.js";

export const DEV_SUPER_ADMIN_EMAIL = "admin@hcp.local";
export const DEV_SUPER_ADMIN_NAME = "System Administrator";
export const DEV_SUPER_ADMIN_PASSWORD = "Admin123!";

export async function seedDevSuperAdmin(): Promise<void> {
  const passwordHash = await hashPassword(DEV_SUPER_ADMIN_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEV_SUPER_ADMIN_EMAIL },
    create: {
      email: DEV_SUPER_ADMIN_EMAIL,
      name: DEV_SUPER_ADMIN_NAME,
      passwordHash,
      platformRole: "super_admin",
      emailVerified: new Date(),
    },
    update: {
      name: DEV_SUPER_ADMIN_NAME,
      passwordHash,
      platformRole: "super_admin",
      emailVerified: new Date(),
    },
  });

  const tenant = await prisma.tenant.findUnique({ where: { slug: DEV_DEMO_TENANT_SLUG } });
  if (tenant) {
    await prisma.membership.upsert({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: tenant.id,
        },
      },
      create: {
        userId: user.id,
        tenantId: tenant.id,
        role: "admin",
        status: "active",
        propertyIds: [],
      },
      update: {
        role: "admin",
        status: "active",
      },
    });
  }

  console.log(`Dev super admin ready: ${DEV_SUPER_ADMIN_EMAIL} (platformRole=super_admin)`);
}
