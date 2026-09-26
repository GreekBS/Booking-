import { GuestNote, type GuestNoteProps, type IGuestNoteRepository } from "@hcp/domain";
import { withTenantTransaction } from "../../client";

function mapNote(row: {
  id: string;
  tenantId: string;
  guestId: string;
  authorUserId: string;
  propertyId: string | null;
  body: string;
  createdAt: Date;
}): GuestNote {
  const props: GuestNoteProps = {
    id: row.id,
    tenantId: row.tenantId,
    guestId: row.guestId,
    authorUserId: row.authorUserId,
    propertyId: row.propertyId,
    body: row.body,
    createdAt: row.createdAt,
  };
  return GuestNote.reconstitute(props);
}

export class PrismaGuestNoteRepository implements IGuestNoteRepository {
  async save(note: GuestNote): Promise<void> {
    const p = note.toProps();
    await withTenantTransaction(p.tenantId, async (tx) => {
      await tx.guestNote.create({
        data: {
          id: p.id,
          tenantId: p.tenantId,
          guestId: p.guestId,
          authorUserId: p.authorUserId,
          propertyId: p.propertyId,
          body: p.body,
          createdAt: p.createdAt,
        },
      });
    });
  }

  async listForGuest(params: {
    tenantId: string;
    guestId: string;
    visiblePropertyIds: string[] | null;
    includeTenantWide: boolean;
  }): Promise<GuestNote[]> {
    return withTenantTransaction(params.tenantId, async (tx) => {
      const base = {
        tenantId: params.tenantId,
        guestId: params.guestId,
      };

      if (params.visiblePropertyIds === null && params.includeTenantWide) {
        const rows = await tx.guestNote.findMany({
          where: base,
          orderBy: { createdAt: "desc" },
        });
        return rows.map(mapNote);
      }

      if (
        params.visiblePropertyIds !== null &&
        params.visiblePropertyIds.length === 0 &&
        !params.includeTenantWide
      ) {
        return [];
      }

      const orConditions: Array<
        { propertyId: null } | { propertyId: { in: string[] } }
      > = [];
      if (params.includeTenantWide) {
        orConditions.push({ propertyId: null });
      }
      if (params.visiblePropertyIds !== null && params.visiblePropertyIds.length > 0) {
        orConditions.push({ propertyId: { in: params.visiblePropertyIds } });
      }

      if (orConditions.length === 0) {
        return [];
      }

      const rows = await tx.guestNote.findMany({
        where: {
          ...base,
          OR: orConditions,
        },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapNote);
    });
  }
}
