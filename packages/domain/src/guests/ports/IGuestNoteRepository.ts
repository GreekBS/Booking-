import type { GuestNote } from "../domain/GuestNote";

export interface IGuestNoteRepository {
  save(note: GuestNote): Promise<void>;

  listForGuest(params: {
    tenantId: string;
    guestId: string;
    /**
     * null = admin: all notes (tenant-wide + all properties).
     * string[] = manager: only notes with propertyId in this set (never tenant-wide).
     */
    visiblePropertyIds: string[] | null;
    includeTenantWide: boolean;
  }): Promise<GuestNote[]>;
}
