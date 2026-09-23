import { Prisma } from "@prisma/client";
import { prisma, setTenantContext } from "../../client";
import {
  Folio,
  FolioLine,
  type FolioLineType,
  type FolioLineSourceType,
  type FolioStatus,
} from "@hcp/domain";
import type { FolioWithLines, IFolioRepository } from "@hcp/domain";

function mapLine(row: {
  id: string;
  tenantId: string;
  folioId: string;
  lineType: FolioLineType;
  description: string;
  amount: Prisma.Decimal;
  currency: string;
  sourceType: string;
  sourceId: string;
  sourceLineRef: string | null;
  sortOrder: number;
  postedAt: Date;
}): FolioLine {
  return FolioLine.rehydrate({
    id: row.id,
    tenantId: row.tenantId,
    folioId: row.folioId,
    lineType: row.lineType,
    description: row.description,
    amount: row.amount.toFixed(4),
    currency: row.currency,
    source: {
      sourceType: row.sourceType as FolioLineSourceType,
      sourceId: row.sourceId,
      sourceLineRef: row.sourceLineRef,
    },
    sortOrder: row.sortOrder,
    postedAt: row.postedAt,
  });
}

function mapFolio(
  row: {
    id: string;
    tenantId: string;
    bookingId: string;
    folioKey: string;
    currency: string;
    status: FolioStatus;
    label: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  lines: FolioLine[],
): FolioWithLines {
  const folio = Folio.rehydrate(
    {
      id: row.id,
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      folioKey: row.folioKey,
      currency: row.currency,
      status: row.status,
      label: row.label,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    },
    lines,
  );
  return { folio, lines };
}

export class PrismaFolioRepository implements IFolioRepository {
  async saveNew(folio: Folio): Promise<"created" | "already_exists"> {
    const props = folio.toProps();
    const lines = folio.lines;
    try {
      await prisma.$transaction(async (tx) => {
        await setTenantContext(tx, props.tenantId);
        await tx.folio.create({
          data: {
            id: props.id,
            tenantId: props.tenantId,
            bookingId: props.bookingId,
            folioKey: props.folioKey,
            currency: props.currency,
            status: props.status,
            label: props.label,
            createdAt: props.createdAt,
            updatedAt: props.updatedAt,
          },
        });
        if (lines.length > 0) {
          await tx.folioLine.createMany({
            data: lines.map((line) => {
              const p = line.toProps();
              return {
                id: p.id,
                tenantId: p.tenantId,
                folioId: p.folioId,
                lineType: p.lineType,
                description: p.description,
                amount: new Prisma.Decimal(p.amount),
                currency: p.currency,
                sourceType: p.source.sourceType,
                sourceId: p.source.sourceId,
                sourceLineRef: p.source.sourceLineRef,
                sortOrder: p.sortOrder,
                postedAt: p.postedAt,
              };
            }),
          });
        }
      });
      return "created";
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "already_exists";
      }
      throw error;
    }
  }

  async findById(tenantId: string, folioId: string): Promise<FolioWithLines | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.folio.findFirst({
      where: { id: folioId, tenantId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!row) return null;
    const lines = row.lines.map(mapLine);
    return mapFolio(row, lines);
  }

  async findByBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<FolioWithLines[]> {
    await setTenantContext(prisma, tenantId);
    const rows = await prisma.folio.findMany({
      where: { tenantId, bookingId },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => mapFolio(row, row.lines.map(mapLine)));
  }

  async findByBookingAndKey(
    tenantId: string,
    bookingId: string,
    folioKey: string,
  ): Promise<FolioWithLines | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.folio.findFirst({
      where: { tenantId, bookingId, folioKey },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!row) return null;
    return mapFolio(row, row.lines.map(mapLine));
  }
}
