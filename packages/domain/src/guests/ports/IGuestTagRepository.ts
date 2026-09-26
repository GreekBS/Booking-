import type { GuestTag } from "../domain/GuestTag";

export interface IGuestTagRepository {
  save(tag: GuestTag): Promise<void>;
  findById(tenantId: string, tagId: string): Promise<GuestTag | null>;
  listActive(tenantId: string): Promise<GuestTag[]>;
  listAll(tenantId: string): Promise<GuestTag[]>;

  assign(params: {
    id: string;
    tenantId: string;
    guestId: string;
    tagId: string;
    assignedByUserId: string | null;
  }): Promise<{ assigned: boolean; alreadyAssigned: boolean }>;

  unassign(params: {
    tenantId: string;
    guestId: string;
    tagId: string;
  }): Promise<{ removed: boolean }>;

  listForGuest(
    tenantId: string,
    guestId: string,
  ): Promise<Array<{ id: string; name: string }>>;
}
