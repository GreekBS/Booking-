import {
  Tenant,
  TenantSettings,
  type TenantProps,
  type IPlatformDirectoryRepository,
  type ListPlatformPropertiesQuery,
  type ListPlatformUsersQuery,
  type PlatformDirectoryPage,
  type PlatformPropertyRow,
  type PlatformTenantDetail,
  type PlatformTenantMemberRow,
  type PlatformUserRow,
  type PropertyStatus,
  type TenantRole,
  type MembershipStatus,
  type PlatformRole,
} from "@hcp/domain";
import { prisma } from "../client";
import type { Prisma, Tenant as PrismaTenant } from "@prisma/client";

function parseTenantSettingsJson(settings: unknown): Partial<{
  dateFormat: import("@hcp/domain").DateFormat;
  timeFormat: import("@hcp/domain").TimeFormat;
}> {
  if (!settings || typeof settings !== "object") {
    return {};
  }
  const value = settings as Record<string, unknown>;
  return {
    dateFormat:
      value.dateFormat === "YYYY-MM-DD" ||
      value.dateFormat === "DD/MM/YYYY" ||
      value.dateFormat === "MM/DD/YYYY"
        ? value.dateFormat
        : undefined,
    timeFormat:
      value.timeFormat === "24h" || value.timeFormat === "12h"
        ? value.timeFormat
        : undefined,
  };
}

function toTenant(record: PrismaTenant): Tenant {
  const jsonSettings = parseTenantSettingsJson(record.settings);
  return Tenant.reconstitute({
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status as TenantProps["status"],
    settings: TenantSettings.create({
      timezone: record.timezone,
      defaultLocale: record.defaultLocale,
      defaultCurrency: record.defaultCurrency,
      dateFormat: jsonSettings.dateFormat,
      timeFormat: jsonSettings.timeFormat,
    }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
  });
}

type PropertyWithTenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  tenantId: string;
  city: string | null;
  region: string | null;
  country: string | null;
  createdAt: Date;
  tenant: { id: string; name: string; slug: string };
  _count: { units: number };
};

function mapProperty(row: PropertyWithTenant): PlatformPropertyRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as PropertyStatus,
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    tenantSlug: row.tenant.slug,
    city: row.city,
    region: row.region,
    country: row.country,
    unitCount: row._count.units,
    createdAt: row.createdAt,
  };
}

export class PrismaPlatformDirectoryRepository
  implements IPlatformDirectoryRepository
{
  async countProperties(): Promise<number> {
    return prisma.property.count({ where: { deletedAt: null } });
  }

  async countUsers(): Promise<number> {
    return prisma.user.count();
  }

  async listProperties(
    query: ListPlatformPropertiesQuery,
  ): Promise<PlatformDirectoryPage<PlatformPropertyRow>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
    };
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.status) where.status = query.status;
    if (query.q) {
      where.name = { contains: query.q, mode: "insensitive" };
    }
    if (query.city) {
      where.city = { contains: query.city, mode: "insensitive" };
    }

    const [rows, total] = await Promise.all([
      prisma.property.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          tenantId: true,
          city: true,
          region: true,
          country: true,
          createdAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
          _count: {
            select: { units: { where: { deletedAt: null } } },
          },
        },
      }),
      prisma.property.count({ where }),
    ]);

    return {
      data: rows.map(mapProperty),
      total,
      page,
      limit,
    };
  }

  async listUsers(
    query: ListPlatformUsersQuery,
  ): Promise<PlatformDirectoryPage<PlatformUserRow>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (query.platformRole === "super_admin") {
      where.platformRole = "super_admin";
    } else if (query.platformRole === "none") {
      where.platformRole = null;
    }
    if (query.tenantId) {
      where.memberships = { some: { tenantId: query.tenantId } };
    }
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          platformRole: true,
          emailVerified: true,
          createdAt: true,
          memberships: {
            select: {
              id: true,
              tenantId: true,
              role: true,
              status: true,
              tenant: { select: { id: true, name: true, slug: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const data: PlatformUserRow[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      platformRole: row.platformRole as PlatformRole | null,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt,
      memberships: row.memberships.map((m) => ({
        membershipId: m.id,
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        tenantSlug: m.tenant.slug,
        role: m.role as TenantRole,
        status: m.status as MembershipStatus,
      })),
    }));

    return { data, total, page, limit };
  }

  async getTenantDetail(tenantId: string): Promise<PlatformTenantDetail | null> {
    const tenantRecord = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (!tenantRecord) return null;

    const [properties, members, propertyCount, memberCount] = await Promise.all([
      prisma.property.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          tenantId: true,
          city: true,
          region: true,
          country: true,
          createdAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
          _count: {
            select: { units: { where: { deletedAt: null } } },
          },
        },
      }),
      prisma.membership.findMany({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              platformRole: true,
            },
          },
        },
      }),
      prisma.property.count({ where: { tenantId, deletedAt: null } }),
      prisma.membership.count({ where: { tenantId } }),
    ]);

    const memberRows: PlatformTenantMemberRow[] = members.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role as TenantRole,
      status: m.status as MembershipStatus,
      platformRole: m.user.platformRole as PlatformRole | null,
      createdAt: m.createdAt,
    }));

    return {
      tenant: toTenant(tenantRecord),
      propertyCount,
      memberCount,
      properties: properties.map(mapProperty),
      members: memberRows,
    };
  }
}
