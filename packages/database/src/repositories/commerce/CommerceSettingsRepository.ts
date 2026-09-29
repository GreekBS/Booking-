import type {
  CommerceSettingsReadModel,
  ICommerceSettingsRepository,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";

function toReadModel(record: {
  tenantId: string;
  defaultHoldTtlSeconds: number;
  confirmationMode: "manual" | "payment_required";
  defaultCurrency: string;
}): CommerceSettingsReadModel {
  return {
    tenantId: record.tenantId,
    defaultHoldTtlSeconds: record.defaultHoldTtlSeconds,
    confirmationMode: record.confirmationMode,
    defaultCurrency: record.defaultCurrency,
  };
}

export class PrismaCommerceSettingsRepository implements ICommerceSettingsRepository {
  async findByTenantId(tenantId: string): Promise<CommerceSettingsReadModel | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.tenantCommerceSettings.findUnique({
        where: { tenantId },
      });

      if (!record) {
        return null;
      }

      return toReadModel(record);
    });
  }

  async ensureDefaults(tenantId: string): Promise<CommerceSettingsReadModel> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.tenantCommerceSettings.upsert({
        where: { tenantId },
        create: {
          tenantId,
          defaultHoldTtlSeconds: 900,
          confirmationMode: "manual",
          defaultCurrency: "EUR",
        },
        update: {},
      });
      return toReadModel(record);
    });
  }

  async update(
    tenantId: string,
    data: Partial<Omit<CommerceSettingsReadModel, "tenantId">>,
  ): Promise<CommerceSettingsReadModel> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.tenantCommerceSettings.update({
        where: { tenantId },
        data: {
          defaultHoldTtlSeconds: data.defaultHoldTtlSeconds,
          confirmationMode: data.confirmationMode,
          defaultCurrency: data.defaultCurrency,
        },
      });

      return toReadModel(record);
    });
  }
}
