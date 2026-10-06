import { withTenantTransaction } from "../../../client";
import type {
  IPropertyStaffPinRepository,
  PropertyStaffPinRecord,
} from "@hcp/domain";

export class PrismaPropertyStaffPinRepository
  implements IPropertyStaffPinRepository
{
  async getForProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyStaffPinRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.property.findFirst({
        where: { id: propertyId, tenantId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          name: true,
          websiteUrl: true,
          staffPinHash: true,
          staffPinFailedAttempts: true,
          staffPinLockedUntil: true,
          staffPinUpdatedAt: true,
        },
      });
      if (!row) return null;
      return {
        propertyId: row.id,
        tenantId: row.tenantId,
        pinHash: row.staffPinHash,
        failedAttempts: row.staffPinFailedAttempts,
        lockedUntil: row.staffPinLockedUntil,
        updatedAt: row.staffPinUpdatedAt,
        websiteUrl: row.websiteUrl,
        propertyName: row.name,
      };
    });
  }

  async getPublicMeta(
    tenantId: string,
    propertyId: string,
  ): Promise<{
    propertyId: string;
    propertyName: string;
    websiteUrl: string | null;
    pinConfigured: boolean;
    lockedUntil: Date | null;
  } | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.property.findFirst({
        where: { id: propertyId, tenantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          websiteUrl: true,
          staffPinHash: true,
          staffPinLockedUntil: true,
        },
      });
      if (!row) return null;
      return {
        propertyId: row.id,
        propertyName: row.name,
        websiteUrl: row.websiteUrl,
        pinConfigured: Boolean(row.staffPinHash),
        lockedUntil: row.staffPinLockedUntil,
      };
    });
  }

  async setPinHash(
    tenantId: string,
    propertyId: string,
    pinHash: string,
    now: Date = new Date(),
  ): Promise<void> {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.property.updateMany({
        where: { id: propertyId, tenantId, deletedAt: null },
        data: {
          staffPinHash: pinHash,
          staffPinFailedAttempts: 0,
          staffPinLockedUntil: null,
          staffPinUpdatedAt: now,
        },
      });
    });
  }

  async recordFailedAttempt(
    tenantId: string,
    propertyId: string,
    input: { failedAttempts: number; lockedUntil: Date | null },
  ): Promise<void> {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.property.updateMany({
        where: { id: propertyId, tenantId, deletedAt: null },
        data: {
          staffPinFailedAttempts: input.failedAttempts,
          staffPinLockedUntil: input.lockedUntil,
        },
      });
    });
  }

  async clearFailures(tenantId: string, propertyId: string): Promise<void> {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.property.updateMany({
        where: { id: propertyId, tenantId, deletedAt: null },
        data: {
          staffPinFailedAttempts: 0,
          staffPinLockedUntil: null,
        },
      });
    });
  }
}
