import { randomBytes } from "node:crypto";
import type {
  CreateDirectBookingIntegrationParams,
  CreateDirectBookingIntegrationResult,
  DirectBookingEnvironment,
  DirectBookingIntegrationPublicLookup,
  DirectBookingIntegrationRecord,
  DirectBookingIntegrationStatus,
  IDirectBookingIntegrationRepository,
} from "@hcp/domain";
import { hashToken } from "../IdentityRepositories";
import { prisma, withTenantTransaction } from "../../client";

export class PrismaDirectBookingIntegrationRepository
  implements IDirectBookingIntegrationRepository
{
  /**
   * Public key lookup by unique hash via SECURITY DEFINER function so FORCE RLS
   * does not require knowing tenantId before authenticating the opaque key.
   */
  async findByPublicKeyHash(
    publicKeyHash: string,
  ): Promise<DirectBookingIntegrationPublicLookup | null> {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        tenant_id: string;
        property_id: string;
        unit_id: string;
        environment: DirectBookingEnvironment;
        allowed_origins: string[];
        status: DirectBookingIntegrationStatus;
      }>
    >`SELECT * FROM public.lookup_direct_booking_integration_by_key_hash(${publicKeyHash})`;

    const record = rows[0];
    if (!record) {
      return null;
    }

    return {
      id: record.id,
      tenantId: record.tenant_id,
      propertyId: record.property_id,
      unitId: record.unit_id,
      environment: record.environment,
      allowedOrigins: record.allowed_origins,
      status: record.status,
    };
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<DirectBookingIntegrationRecord | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.directBookingIntegration.findFirst({
        where: { id, tenantId },
      });
      return record ? mapRecord(record) : null;
    });
  }

  async listByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<DirectBookingIntegrationRecord[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.directBookingIntegration.findMany({
        where: { tenantId, propertyId },
        orderBy: { createdAt: "desc" },
      });
      return records.map(mapRecord);
    });
  }

  async create(
    params: CreateDirectBookingIntegrationParams,
  ): Promise<CreateDirectBookingIntegrationResult> {
    const created = await withTenantTransaction(params.tenantId, async (tx) => {
      return tx.directBookingIntegration.create({
        data: {
          id: params.id,
          tenantId: params.tenantId,
          propertyId: params.propertyId,
          unitId: params.unitId,
          publicKeyHash: hashToken(params.rawPublicKey),
          publicKeyPrefix: params.rawPublicKey.slice(0, 16),
          environment: params.environment,
          allowedOrigins: params.allowedOrigins,
          status: params.status,
        },
      });
    });

    return {
      integration: mapRecord(created),
      publicKey: params.rawPublicKey,
    };
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: DirectBookingIntegrationStatus,
  ): Promise<DirectBookingIntegrationRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.directBookingIntegration.update({
        where: { id },
        data: { status },
      });
      return mapRecord(record);
    });
  }

  async updateAllowedOrigins(
    id: string,
    tenantId: string,
    allowedOrigins: string[],
  ): Promise<DirectBookingIntegrationRecord> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.directBookingIntegration.update({
        where: { id },
        data: { allowedOrigins },
      });
      return mapRecord(record);
    });
  }
}

function mapRecord(record: {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  publicKeyPrefix: string;
  environment: DirectBookingEnvironment;
  allowedOrigins: string[];
  status: DirectBookingIntegrationStatus;
  createdAt: Date;
  updatedAt: Date;
}): DirectBookingIntegrationRecord {
  return {
    id: record.id,
    tenantId: record.tenantId,
    propertyId: record.propertyId,
    unitId: record.unitId,
    publicKeyPrefix: record.publicKeyPrefix,
    environment: record.environment,
    allowedOrigins: record.allowedOrigins,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function generateDirectBookingPublicKey(
  environment: DirectBookingEnvironment,
): { rawKey: string; keyHash: string } {
  const suffix = randomBytes(18)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 24);
  const rawKey = `dbk_${environment}_${suffix}`;
  return { rawKey, keyHash: hashToken(rawKey) };
}
