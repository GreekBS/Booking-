import {
  Property,
  Location,
  PropertyPolicies,
  type PropertyProps,
  type IPropertyRepository,
  type PaginatedResult,
  type PaginationParams,
} from "@hcp/domain";
import { prisma, setTenantContext } from "../client";
import {
  PrismaOutboxRepository,
  saveAggregateWithOutbox,
  type TransactionClient,
} from "./OutboxRepository";
import type {
  Property as PrismaProperty,
  Unit as PrismaUnit,
  PropertyStatus,
  PropertyType,
  CancellationPolicyType,
} from "@prisma/client";

function mapLocation(record: PrismaProperty): Location {
  return Location.create({
    addressLine: record.addressLine,
    city: record.city,
    region: record.region,
    postalCode: record.postalCode,
    country: record.country,
    latitude: record.latitude ? Number(record.latitude) : null,
    longitude: record.longitude ? Number(record.longitude) : null,
  });
}

function mapPolicies(record: PrismaProperty): PropertyPolicies {
  return PropertyPolicies.create({
    checkInTime: record.checkInTime,
    checkOutTime: record.checkOutTime,
    cancellationPolicyType: record.cancellationPolicyType,
  });
}

function toDomain(
  record: PrismaProperty,
  units: PrismaUnit[],
  amenityIds: string[],
): Property {
  return Property.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    name: record.name,
    slug: record.slug,
    description: record.description,
    type: record.type as PropertyProps["type"],
    status: record.status as PropertyProps["status"],
    timezone: record.timezone,
    location: mapLocation(record),
    policies: mapPolicies(record),
    amenityIds,
    units: units.map((u) => ({
      id: u.id,
      tenantId: u.tenantId,
      propertyId: u.propertyId,
      name: u.name,
      slug: u.slug,
      maxGuests: u.maxGuests,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      status: u.status as PropertyProps["units"][0]["status"],
      deletedAt: u.deletedAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export class PrismaPropertyRepository implements IPropertyRepository {
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async save(property: Property): Promise<void> {
    const props = property.toProps();
    const events = property.pullDomainEvents();

    await saveAggregateWithOutbox(
      this.outboxRepository,
      events,
      async (tx: TransactionClient) => {
        await setTenantContext(tx, props.tenantId);

        await tx.property.upsert({
        where: { id: props.id },
        create: {
          id: props.id,
          tenantId: props.tenantId,
          name: props.name,
          slug: props.slug,
          description: props.description,
          type: props.type as PropertyType,
          status: props.status as PropertyStatus,
          timezone: props.timezone,
          addressLine: props.location.addressLine,
          city: props.location.city,
          region: props.location.region,
          postalCode: props.location.postalCode,
          country: props.location.country,
          latitude: props.location.latitude,
          longitude: props.location.longitude,
          checkInTime: props.policies.checkInTime,
          checkOutTime: props.policies.checkOutTime,
          cancellationPolicyType: props.policies
            .cancellationPolicyType as CancellationPolicyType,
          deletedAt: props.deletedAt,
        },
        update: {
          name: props.name,
          slug: props.slug,
          description: props.description,
          type: props.type as PropertyType,
          status: props.status as PropertyStatus,
          timezone: props.timezone,
          addressLine: props.location.addressLine,
          city: props.location.city,
          region: props.location.region,
          postalCode: props.location.postalCode,
          country: props.location.country,
          latitude: props.location.latitude,
          longitude: props.location.longitude,
          checkInTime: props.policies.checkInTime,
          checkOutTime: props.policies.checkOutTime,
          cancellationPolicyType: props.policies
            .cancellationPolicyType as CancellationPolicyType,
          deletedAt: props.deletedAt,
        },
      });

      for (const unit of props.units) {
        await tx.unit.upsert({
          where: { id: unit.id },
          create: {
            id: unit.id,
            tenantId: unit.tenantId,
            propertyId: unit.propertyId,
            name: unit.name,
            slug: unit.slug,
            maxGuests: unit.maxGuests,
            bedrooms: unit.bedrooms,
            bathrooms: unit.bathrooms,
            status: unit.status,
            deletedAt: unit.deletedAt,
          },
          update: {
            name: unit.name,
            slug: unit.slug,
            maxGuests: unit.maxGuests,
            bedrooms: unit.bedrooms,
            bathrooms: unit.bathrooms,
            status: unit.status,
            deletedAt: unit.deletedAt,
          },
        });
      }

      await tx.propertyAmenity.deleteMany({ where: { propertyId: props.id } });
      if (props.amenityIds.length > 0) {
        await tx.propertyAmenity.createMany({
          data: props.amenityIds.map((amenityId) => ({
            propertyId: props.id,
            amenityId,
          })),
        });
      }
      },
    );
  }

  async findById(tenantId: string, propertyId: string): Promise<Property | null> {
    const record = await prisma.property.findFirst({
      where: { id: propertyId, tenantId, deletedAt: null },
      include: {
        units: true,
        amenities: { select: { amenityId: true } },
      },
    });

    if (!record) return null;

    return toDomain(
      record,
      record.units,
      record.amenities.map((a) => a.amenityId),
    );
  }

  async findBySlug(tenantId: string, slug: string): Promise<Property | null> {
    const record = await prisma.property.findFirst({
      where: { tenantId, slug, deletedAt: null },
      include: {
        units: true,
        amenities: { select: { amenityId: true } },
      },
    });

    if (!record) return null;

    return toDomain(
      record,
      record.units,
      record.amenities.map((a) => a.amenityId),
    );
  }

  async existsBySlug(tenantId: string, slug: string): Promise<boolean> {
    const count = await prisma.property.count({ where: { tenantId, slug } });
    return count > 0;
  }

  async findAll(
    tenantId: string,
    params: PaginationParams,
    propertyIds?: string[] | null,
  ): Promise<PaginatedResult<Property>> {
    const skip = (params.page - 1) * params.limit;

    const where = {
      tenantId,
      deletedAt: null,
      ...(propertyIds && propertyIds.length > 0
        ? { id: { in: propertyIds } }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.property.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { createdAt: "desc" },
        include: {
          units: true,
          amenities: { select: { amenityId: true } },
        },
      }),
      prisma.property.count({ where }),
    ]);

    return {
      data: records.map((r) =>
        toDomain(r, r.units, r.amenities.map((a) => a.amenityId)),
      ),
      total,
      page: params.page,
      limit: params.limit,
    };
  }
}
