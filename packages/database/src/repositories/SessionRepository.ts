import { prisma } from "../client";
import type { ISessionRepository } from "@hcp/domain";

export class PrismaSessionRepository implements ISessionRepository {
  async setActiveTenant(userId: string, tenantId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { userId },
      data: { activeTenantId: tenantId },
    });
  }
}
