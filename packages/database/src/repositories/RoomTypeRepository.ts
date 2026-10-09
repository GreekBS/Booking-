import { Prisma } from "@prisma/client";
import {
  ConflictError,
  RoomType,
  type IRoomTypeRepository,
  type ListRoomTypesOptions,
  type RoomTypeStatus,
} from "@hcp/domain";
import { withTenantTransaction } from "../client";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

function toDomain(record: {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  code: string | null;
  description: string | null;
  maxGuests: number;
  maxAdults: number | null;
  maxChildren: number | null;
  status: string;
  sortOrder: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RoomType {
  return RoomType.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    propertyId: record.propertyId,
    name: record.name,
    code: record.code,
    description: record.description,
    maxGuests: record.maxGuests,
    maxAdults: record.maxAdults,
    maxChildren: record.maxChildren,
    status: record.status as RoomTypeStatus,
    sortOrder: record.sortOrder,
    deletedAt: record.deletedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export class PrismaRoomTypeRepository implements IRoomTypeRepository {
  async save(roomType: RoomType): Promise<void> {
    const props = roomType.toProps();
    try {
      await withTenantTransaction(props.tenantId, async (tx) => {
        await tx.roomType.upsert({
          where: { id: props.id },
          create: {
            id: props.id,
            tenantId: props.tenantId,
            propertyId: props.propertyId,
            name: props.name,
            code: props.code,
            description: props.description,
            maxGuests: props.maxGuests,
            maxAdults: props.maxAdults,
            maxChildren: props.maxChildren,
            status: props.status,
            sortOrder: props.sortOrder,
            deletedAt: props.deletedAt,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt,
          },
          update: {
            name: props.name,
            code: props.code,
            description: props.description,
            maxGuests: props.maxGuests,
            maxAdults: props.maxAdults,
            maxChildren: props.maxChildren,
            status: props.status,
            sortOrder: props.sortOrder,
            deletedAt: props.deletedAt,
            updatedAt: props.updatedAt,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "A RoomType with this code already exists for the property",
        );
      }
      throw error;
    }
  }

  async findById(
    tenantId: string,
    propertyId: string,
    roomTypeId: string,
  ): Promise<RoomType | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.roomType.findFirst({
        where: { id: roomTypeId, tenantId, propertyId },
      });
      return record ? toDomain(record) : null;
    });
  }

  async listByProperty(
    tenantId: string,
    propertyId: string,
    options?: ListRoomTypesOptions,
  ): Promise<RoomType[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.roomType.findMany({
        where: {
          tenantId,
          propertyId,
          ...(options?.includeDeleted ? {} : { deletedAt: null }),
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      });
      return records.map(toDomain);
    });
  }

  async countLinkedUnits(
    tenantId: string,
    propertyId: string,
    roomTypeId: string,
  ): Promise<number> {
    return withTenantTransaction(tenantId, async (tx) => {
      return tx.unit.count({
        where: {
          tenantId,
          propertyId,
          roomTypeId,
          deletedAt: null,
        },
      });
    });
  }
}
