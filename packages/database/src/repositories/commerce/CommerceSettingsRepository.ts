import type {
  CommerceSettingsReadModel,
  ICommerceSettingsRepository,
} from "@hcp/domain";
import { prisma } from "../../client";

export class PrismaCommerceSettingsRepository implements ICommerceSettingsRepository {
  async findByTenantId(tenantId: string): Promise<CommerceSettingsReadModel | null> {
    const record = await prisma.tenantCommerceSettings.findUnique({
      where: { tenantId },
    });

    if (!record) {
      return null;
    }

    return {
      tenantId: record.tenantId,
      defaultHoldTtlSeconds: record.defaultHoldTtlSeconds,
      confirmationMode: record.confirmationMode,
      defaultCurrency: record.defaultCurrency,
    };
  }

  async update(
    tenantId: string,
    data: Partial<Omit<CommerceSettingsReadModel, "tenantId">>,
  ): Promise<CommerceSettingsReadModel> {
    const record = await prisma.tenantCommerceSettings.update({
      where: { tenantId },
      data: {
        defaultHoldTtlSeconds: data.defaultHoldTtlSeconds,
        confirmationMode: data.confirmationMode,
        defaultCurrency: data.defaultCurrency,
      },
    });

    return {
      tenantId: record.tenantId,
      defaultHoldTtlSeconds: record.defaultHoldTtlSeconds,
      confirmationMode: record.confirmationMode,
      defaultCurrency: record.defaultCurrency,
    };
  }
}
