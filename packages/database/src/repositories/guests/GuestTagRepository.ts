import {
  GuestTag,
  type GuestTagProps,
  type IGuestTagRepository,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";

function mapTag(row: {
  id: string;
  tenantId: string;
  name: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): GuestTag {
  const props: GuestTagProps = {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return GuestTag.reconstitute(props);
}

export class PrismaGuestTagRepository implements IGuestTagRepository {
  async save(tag: GuestTag): Promise<void> {
    const p = tag.toProps();
    await withTenantTransaction(p.tenantId, async (tx) => {
      await tx.guestTag.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          tenantId: p.tenantId,
          name: p.name,
          archivedAt: p.archivedAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        },
        update: {
          name: p.name,
          archivedAt: p.archivedAt,
          updatedAt: p.updatedAt,
        },
      });
    });
  }

  async findById(tenantId: string, tagId: string): Promise<GuestTag | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.guestTag.findFirst({
        where: { id: tagId, tenantId },
      });
      return row ? mapTag(row) : null;
    });
  }

  async listActive(tenantId: string): Promise<GuestTag[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.guestTag.findMany({
        where: { tenantId, archivedAt: null },
        orderBy: { name: "asc" },
      });
      return rows.map(mapTag);
    });
  }

  async listAll(tenantId: string): Promise<GuestTag[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.guestTag.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });
      return rows.map(mapTag);
    });
  }

  async assign(params: {
    id: string;
    tenantId: string;
    guestId: string;
    tagId: string;
    assignedByUserId: string | null;
  }): Promise<{ assigned: boolean; alreadyAssigned: boolean }> {
    return withTenantTransaction(params.tenantId, async (tx) => {
      const existing = await tx.guestTagAssignment.findFirst({
        where: {
          tenantId: params.tenantId,
          guestId: params.guestId,
          tagId: params.tagId,
        },
        select: { id: true },
      });
      if (existing) {
        return { assigned: false, alreadyAssigned: true };
      }

      try {
        await tx.guestTagAssignment.create({
          data: {
            id: params.id,
            tenantId: params.tenantId,
            guestId: params.guestId,
            tagId: params.tagId,
            assignedByUserId: params.assignedByUserId,
          },
        });
        return { assigned: true, alreadyAssigned: false };
      } catch {
        return { assigned: false, alreadyAssigned: true };
      }
    });
  }

  async unassign(params: {
    tenantId: string;
    guestId: string;
    tagId: string;
  }): Promise<{ removed: boolean }> {
    return withTenantTransaction(params.tenantId, async (tx) => {
      const deleted = await tx.guestTagAssignment.deleteMany({
        where: {
          tenantId: params.tenantId,
          guestId: params.guestId,
          tagId: params.tagId,
        },
      });
      return { removed: deleted.count > 0 };
    });
  }

  async listForGuest(
    tenantId: string,
    guestId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.guestTagAssignment.findMany({
        where: { tenantId, guestId },
        include: {
          tag: {
            select: { id: true, name: true, archivedAt: true },
          },
        },
        orderBy: { assignedAt: "asc" },
      });
      return rows
        .filter((r) => r.tag.archivedAt == null)
        .map((r) => ({ id: r.tag.id, name: r.tag.name }));
    });
  }
}
