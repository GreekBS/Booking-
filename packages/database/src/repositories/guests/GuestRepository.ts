import { createHash } from "node:crypto";
import {
  Guest,
  type GuestProps,
  type GuestIdentityLockKind,
  type IGuestRepository,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";

function mapGuest(row: {
  id: string;
  tenantId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  phoneNormalized: string | null;
  country: string | null;
  preferredLanguage: string | null;
  archivedAt: Date | null;
  mergedIntoGuestId: string | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Guest {
  const props: GuestProps = {
    id: row.id,
    tenantId: row.tenantId,
    displayName: row.displayName,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    emailNormalized: row.emailNormalized,
    phone: row.phone,
    phoneNormalized: row.phoneNormalized,
    country: row.country,
    preferredLanguage: row.preferredLanguage,
    archivedAt: row.archivedAt,
    mergedIntoGuestId: row.mergedIntoGuestId,
    anonymizedAt: row.anonymizedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  return Guest.reconstitute(props);
}

/** Deterministic int4 pair for pg_advisory_xact_lock (not a uniqueness claim). */
function advisoryLockKeys(
  tenantId: string,
  kind: GuestIdentityLockKind,
  normalizedKey: string,
): [number, number] {
  const digest = createHash("sha256")
    .update(`guest-identity:${tenantId}:${kind}:${normalizedKey}`)
    .digest();
  const k1 = digest.readInt32BE(0);
  const k2 = digest.readInt32BE(4);
  return [k1, k2];
}

export class PrismaGuestRepository implements IGuestRepository {
  async save(guest: Guest): Promise<void> {
    const p = guest.toProps();
    await withTenantTransaction(p.tenantId, async (tx) => {
      await tx.guest.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          tenantId: p.tenantId,
          displayName: p.displayName,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          emailNormalized: p.emailNormalized,
          phone: p.phone,
          phoneNormalized: p.phoneNormalized,
          country: p.country,
          preferredLanguage: p.preferredLanguage,
          archivedAt: p.archivedAt,
          mergedIntoGuestId: p.mergedIntoGuestId,
          anonymizedAt: p.anonymizedAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        },
        update: {
          displayName: p.displayName,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          emailNormalized: p.emailNormalized,
          phone: p.phone,
          phoneNormalized: p.phoneNormalized,
          country: p.country,
          preferredLanguage: p.preferredLanguage,
          archivedAt: p.archivedAt,
          mergedIntoGuestId: p.mergedIntoGuestId,
          anonymizedAt: p.anonymizedAt,
          updatedAt: p.updatedAt,
        },
      });
    });
  }

  async findById(tenantId: string, guestId: string): Promise<Guest | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.guest.findFirst({
        where: { id: guestId, tenantId },
      });
      return row ? mapGuest(row) : null;
    });
  }

  async findActiveByEmailNormalized(
    tenantId: string,
    emailNormalized: string,
  ): Promise<Guest[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.guest.findMany({
        where: {
          tenantId,
          emailNormalized,
          archivedAt: null,
          mergedIntoGuestId: null,
        },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(mapGuest);
    });
  }

  async findActiveByPhoneNormalized(
    tenantId: string,
    phoneNormalized: string,
  ): Promise<Guest[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.guest.findMany({
        where: {
          tenantId,
          phoneNormalized,
          archivedAt: null,
          mergedIntoGuestId: null,
        },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(mapGuest);
    });
  }

  async withIdentityLock<T>(
    tenantId: string,
    kind: GuestIdentityLockKind,
    normalizedKey: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const [k1, k2] = advisoryLockKeys(tenantId, kind, normalizedKey);
    return withTenantTransaction(tenantId, async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${k1}::int, ${k2}::int)
      `;
      return fn();
    });
  }

  async linkBookingGuestIfUnlinked(
    tenantId: string,
    bookingId: string,
    guestId: string,
  ): Promise<{ linked: boolean; alreadyLinked: boolean }> {
    return withTenantTransaction(tenantId, async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, tenantId },
        select: { guestId: true },
      });
      if (!booking) {
        return { linked: false, alreadyLinked: false };
      }
      if (booking.guestId === guestId) {
        return { linked: false, alreadyLinked: true };
      }
      if (booking.guestId != null) {
        return { linked: false, alreadyLinked: true };
      }

      const guest = await tx.guest.findFirst({
        where: { id: guestId, tenantId },
        select: { id: true },
      });
      if (!guest) {
        return { linked: false, alreadyLinked: false };
      }

      const updated = await tx.booking.updateMany({
        where: { id: bookingId, tenantId, guestId: null },
        data: { guestId },
      });
      return {
        linked: updated.count === 1,
        alreadyLinked: updated.count === 0,
      };
    });
  }

  async findBookingGuestLink(
    tenantId: string,
    bookingId: string,
  ): Promise<{ guestId: string | null } | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, tenantId },
        select: { guestId: true },
      });
      if (!booking) return null;
      return { guestId: booking.guestId };
    });
  }
}
