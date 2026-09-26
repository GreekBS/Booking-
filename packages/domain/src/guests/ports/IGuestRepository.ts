import type { Guest } from "../domain/Guest";

export interface GuestContactInput {
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  preferredLanguage?: string | null;
}

export type GuestIdentityLockKind = "email" | "phone";

export interface IGuestRepository {
  save(guest: Guest): Promise<void>;

  findById(tenantId: string, guestId: string): Promise<Guest | null>;

  findActiveByEmailNormalized(
    tenantId: string,
    emailNormalized: string,
  ): Promise<Guest[]>;

  findActiveByPhoneNormalized(
    tenantId: string,
    phoneNormalized: string,
  ): Promise<Guest[]>;

  /**
   * Serialize resolve/create for a strong identity key within a tenant transaction.
   * Uses scoped advisory locking — does NOT imply global uniqueness of email/phone.
   */
  withIdentityLock<T>(
    tenantId: string,
    kind: GuestIdentityLockKind,
    normalizedKey: string,
    fn: () => Promise<T>,
  ): Promise<T>;

  /**
   * Set bookings.guest_id when currently null. Does not mutate snapshot columns.
   * Returns true when linkage was applied (or already linked to same guest).
   */
  linkBookingGuestIfUnlinked(
    tenantId: string,
    bookingId: string,
    guestId: string,
  ): Promise<{ linked: boolean; alreadyLinked: boolean }>;

  findBookingGuestLink(
    tenantId: string,
    bookingId: string,
  ): Promise<{ guestId: string | null } | null>;
}
