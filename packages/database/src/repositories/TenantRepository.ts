import type { ITenantRepository } from "@hcp/domain";
import { Tenant, TenantSettings, type TenantProps } from "@hcp/domain";
import { prisma } from "../client";
import type { Tenant as PrismaTenant, TenantStatus } from "@prisma/client";
import {
  PrismaOutboxRepository,
  saveAggregateWithOutbox,
  type TransactionClient,
} from "./OutboxRepository";

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
    timeFormat: value.timeFormat === "24h" || value.timeFormat === "12h" ? value.timeFormat : undefined,
  };
}

function toDomain(record: PrismaTenant): Tenant {
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

export class PrismaTenantRepository implements ITenantRepository {
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async save(tenant: Tenant): Promise<void> {
    const props = tenant.toProps();
    const settings = tenant.settings;
    const events = tenant.pullDomainEvents();

    await saveAggregateWithOutbox(
      this.outboxRepository,
      events,
      async (tx: TransactionClient) => {
        await tx.tenant.upsert({
          where: { id: props.id },
          create: {
            id: props.id,
            name: props.name,
            slug: props.slug,
            status: props.status as TenantStatus,
            timezone: settings.timezone,
            defaultLocale: settings.defaultLocale,
            defaultCurrency: settings.defaultCurrency,
            settings: {
              dateFormat: settings.dateFormat,
              timeFormat: settings.timeFormat,
            },
            deletedAt: props.deletedAt,
          },
          update: {
            name: props.name,
            slug: props.slug,
            status: props.status as TenantStatus,
            timezone: settings.timezone,
            defaultLocale: settings.defaultLocale,
            defaultCurrency: settings.defaultCurrency,
            settings: {
              dateFormat: settings.dateFormat,
              timeFormat: settings.timeFormat,
            },
            deletedAt: props.deletedAt,
          },
        });
      },
    );
  }

  async findById(id: string): Promise<Tenant | null> {
    const record = await prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
    return record ? toDomain(record) : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const record = await prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
    return record ? toDomain(record) : null;
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await prisma.tenant.count({ where: { slug } });
    return count > 0;
  }

  async findAll(params: import("@hcp/domain").PaginationParams) {
    const skip = (params.page - 1) * params.limit;
    const [records, total] = await Promise.all([
      prisma.tenant.findMany({
        where: { deletedAt: null },
        skip,
        take: params.limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.tenant.count({ where: { deletedAt: null } }),
    ]);

    return {
      data: records.map(toDomain),
      total,
      page: params.page,
      limit: params.limit,
    };
  }

  async countProperties(tenantId: string): Promise<number> {
    return prisma.property.count({
      where: { tenantId, deletedAt: null },
    });
  }

  async countSummary() {
    const where = { deletedAt: null as Date | null };
    const [total, active, suspended] = await Promise.all([
      prisma.tenant.count({ where }),
      prisma.tenant.count({ where: { ...where, status: "active" } }),
      prisma.tenant.count({ where: { ...where, status: "suspended" } }),
    ]);
    return { total, active, suspended };
  }
}
