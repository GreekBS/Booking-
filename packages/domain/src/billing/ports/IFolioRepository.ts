import type { Folio, FolioLine, FolioProps, FolioLineProps } from "../domain/Folio";

export interface FolioWithLines {
  folio: Folio;
  lines: FolioLine[];
}

export interface IFolioRepository {
  /**
   * Insert folio + lines atomically.
   * Must honor unique (tenantId, bookingId, folioKey).
   * On unique conflict for primary open, callers re-read.
   */
  saveNew(folio: Folio): Promise<"created" | "already_exists">;

  findById(tenantId: string, folioId: string): Promise<FolioWithLines | null>;

  findByBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<FolioWithLines[]>;

  findByBookingAndKey(
    tenantId: string,
    bookingId: string,
    folioKey: string,
  ): Promise<FolioWithLines | null>;

  /**
   * Append newly posted lines only. Never updates/deletes existing posted lines.
   */
  appendLines(
    tenantId: string,
    folioId: string,
    lines: FolioLine[],
  ): Promise<"appended" | "conflict">;
}

export type { FolioProps, FolioLineProps };
