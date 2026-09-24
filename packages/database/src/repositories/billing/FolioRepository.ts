import { Prisma } from "@prisma/client";
import { withTenantTransaction } from "../../client";
import {
  Folio,
  FolioLine,
  type FolioLineType,
  type FolioLineSourceType,
  type FolioStatus,
  type FolioLineTaxSnapshot,
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
  taxSnapshot: Prisma.JsonValue | null;
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
    taxSnapshot: (row.taxSnapshot as FolioLineTaxSnapshot | null) ?? null,
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

function lineCreateData(line: FolioLine) {
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
    taxSnapshot: p.taxSnapshot
      ? (p.taxSnapshot as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull,
  };
}

export class PrismaFolioRepository implements IFolioRepository {
  async saveNew(folio: Folio): Promise<"created" | "already_exists"> {
    const props = folio.toProps();
    const lines = folio.lines;
    try {
      await withTenantTransaction(props.tenantId, async (tx) => {
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
            data: lines.map(lineCreateData),
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

  async appendLines(
    tenantId: string,
    folioId: string,
    lines: FolioLine[],
  ): Promise<"appended" | "conflict"> {
    if (lines.length === 0) return "appended";
    try {
      await withTenantTransaction(tenantId, async (tx) => {
        const folio = await tx.folio.findFirst({
          where: { id: folioId, tenantId },
        });
        if (!folio) {
          throw new Error("Folio not found for append");
        }
        await tx.folioLine.createMany({
          data: lines.map(lineCreateData),
        });
        await tx.folio.update({
          where: { id: folioId },
          data: { updatedAt: new Date() },
        });
      });
      return "appended";
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "conflict";
      }
      throw error;
    }
  }

  async findById(tenantId: string, folioId: string): Promise<FolioWithLines | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.folio.findFirst({
        where: { id: folioId, tenantId },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      });
      if (!row) return null;
      const lines = row.lines.map(mapLine);
      return mapFolio(row, lines);
    });
  }

  async findByBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<FolioWithLines[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.folio.findMany({
        where: { tenantId, bookingId },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => mapFolio(row, row.lines.map(mapLine)));
    });
  }

  async findByBookingAndKey(
    tenantId: string,
    bookingId: string,
    folioKey: string,
  ): Promise<FolioWithLines | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.folio.findFirst({
        where: { tenantId, bookingId, folioKey },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
      });
      if (!row) return null;
      return mapFolio(row, row.lines.map(mapLine));
    });
  }
}
