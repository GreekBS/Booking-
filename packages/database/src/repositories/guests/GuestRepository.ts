import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  Guest,
  type GuestDirectoryFilters,
  type GuestDirectoryStayMetrics,
  type GuestIdentityLockKind,
  type GuestProfileMetrics,
  type GuestProps,
  type IGuestRepository,
  type PaginatedGuestDirectory,
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

function formatDateColumn(value: Date | null | undefined): string | null {
  if (value == null) return null;
  return value.toISOString().slice(0, 10);
}

/** Booking property scope for directory / metrics (visible properties only). */
function resolveDirectoryBookingPropertyIds(
  filters: Pick<GuestDirectoryFilters, "propertyId" | "allowedPropertyIds">,
): string[] | null {
  const { propertyId, allowedPropertyIds } = filters;
  if (allowedPropertyIds !== null) {
    if (propertyId) {
      return allowedPropertyIds.includes(propertyId) ? [propertyId] : [];
    }
    return allowedPropertyIds;
  }
  if (propertyId) {
    return [propertyId];
  }
  return null;
}

function bookingPropertyWhere(
  tenantId: string,
  guestId: string,
  allowedPropertyIds: string[] | null,
) {
  const base = {
    tenantId,
    guestId,
    status: { not: "cancelled" as const },
  };
  if (allowedPropertyIds === null) {
    return base;
  }
  if (allowedPropertyIds.length === 0) {
    return { ...base, propertyId: { in: [] as string[] } };
  }
  return { ...base, propertyId: { in: allowedPropertyIds } };
}

type DirectoryGuestRow = {
  id: string;
  tenant_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_normalized: string | null;
  phone: string | null;
  phone_normalized: string | null;
  country: string | null;
  preferred_language: string | null;
  archived_at: Date | null;
  merged_into_guest_id: string | null;
  anonymized_at: Date | null;
  created_at: Date;
  updated_at: Date;
  stay_count: number;
  last_stay_check_out: Date | null;
  next_stay_check_in: Date | null;
};

function mapDirectoryGuestRow(row: DirectoryGuestRow): {
  guest: Guest;
  metrics: GuestDirectoryStayMetrics;
} {
  const guest = mapGuest({
    id: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    emailNormalized: row.email_normalized,
    phone: row.phone,
    phoneNormalized: row.phone_normalized,
    country: row.country,
    preferredLanguage: row.preferred_language,
    archivedAt: row.archived_at,
    mergedIntoGuestId: row.merged_into_guest_id,
    anonymizedAt: row.anonymized_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  return {
    guest,
    metrics: {
      stayCount: row.stay_count,
      lastStayCheckOut: formatDateColumn(row.last_stay_check_out),
      nextStayCheckIn: formatDateColumn(row.next_stay_check_in),
    },
  };
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

  async searchDirectory(
    filters: GuestDirectoryFilters,
  ): Promise<PaginatedGuestDirectory> {
    const propertyIds = resolveDirectoryBookingPropertyIds(filters);
    if (propertyIds !== null && propertyIds.length === 0) {
      return {
        data: [],
        total: 0,
        page: filters.page,
        limit: filters.limit,
      };
    }

    const offset = (filters.page - 1) * filters.limit;
    const searchTerm = filters.search?.trim() || null;

    const archivedClause = filters.includeArchived
      ? Prisma.empty
      : Prisma.sql`AND g.archived_at IS NULL`;

    const searchClause = searchTerm
      ? Prisma.sql`AND (
          g.display_name ILIKE ${`%${searchTerm}%`}
          OR g.email_normalized ILIKE ${`%${searchTerm}%`}
          OR g.phone_normalized ILIKE ${`%${searchTerm}%`}
        )`
      : Prisma.empty;

    const propertyClause =
      propertyIds === null
        ? Prisma.empty
        : Prisma.sql`AND b.property_id IN (${Prisma.join(
            propertyIds.map((id) => Prisma.sql`${id}::uuid`),
          )})`;

    return withTenantTransaction(filters.tenantId, async (tx) => {
      const countRows = await tx.$queryRaw<Array<{ total: number }>>`
        SELECT COUNT(DISTINCT g.id)::int AS total
        FROM guests g
        INNER JOIN bookings b
          ON b.guest_id = g.id
         AND b.tenant_id = g.tenant_id
         AND b.guest_id IS NOT NULL
        WHERE g.tenant_id = ${filters.tenantId}::uuid
        ${archivedClause}
        ${searchClause}
        ${propertyClause}
      `;
      const total = countRows[0]?.total ?? 0;

      if (total === 0) {
        return {
          data: [],
          total: 0,
          page: filters.page,
          limit: filters.limit,
        };
      }

      const rows = await tx.$queryRaw<DirectoryGuestRow[]>`
        SELECT
          g.id,
          g.tenant_id,
          g.display_name,
          g.first_name,
          g.last_name,
          g.email,
          g.email_normalized,
          g.phone,
          g.phone_normalized,
          g.country,
          g.preferred_language,
          g.archived_at,
          g.merged_into_guest_id,
          g.anonymized_at,
          g.created_at,
          g.updated_at,
          COUNT(b.id) FILTER (WHERE b.status <> 'cancelled')::int AS stay_count,
          MAX(b.check_out) FILTER (
            WHERE b.status <> 'cancelled' AND b.check_out < CURRENT_DATE
          ) AS last_stay_check_out,
          MIN(b.check_in) FILTER (
            WHERE b.status <> 'cancelled' AND b.check_in >= CURRENT_DATE
          ) AS next_stay_check_in
        FROM guests g
        INNER JOIN bookings b
          ON b.guest_id = g.id
         AND b.tenant_id = g.tenant_id
         AND b.guest_id IS NOT NULL
        WHERE g.tenant_id = ${filters.tenantId}::uuid
        ${archivedClause}
        ${searchClause}
        ${propertyClause}
        GROUP BY g.id
        ORDER BY g.display_name ASC
        LIMIT ${filters.limit}
        OFFSET ${offset}
      `;

      const guestIds = rows.map((r) => r.id);
      const tagRows =
        guestIds.length === 0
          ? []
          : await tx.guestTagAssignment.findMany({
              where: {
                tenantId: filters.tenantId,
                guestId: { in: guestIds },
              },
              include: {
                tag: { select: { id: true, name: true, archivedAt: true } },
              },
              orderBy: { assignedAt: "asc" },
            });

      const tagsByGuest = new Map<string, Array<{ id: string; name: string }>>();
      for (const assignment of tagRows) {
        if (assignment.tag.archivedAt != null) continue;
        const list = tagsByGuest.get(assignment.guestId) ?? [];
        list.push({ id: assignment.tag.id, name: assignment.tag.name });
        tagsByGuest.set(assignment.guestId, list);
      }

      return {
        data: rows.map((row) => {
          const { guest, metrics } = mapDirectoryGuestRow(row);
          return {
            guest,
            metrics,
            tags: tagsByGuest.get(row.id) ?? [],
          };
        }),
        total,
        page: filters.page,
        limit: filters.limit,
      };
    });
  }

  async hasVisibleBookingActivity(
    tenantId: string,
    guestId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<boolean> {
    return withTenantTransaction(tenantId, async (tx) => {
      const count = await tx.booking.count({
        where: bookingPropertyWhere(tenantId, guestId, allowedPropertyIds),
      });
      return count > 0;
    });
  }

  async getVisibleStayMetrics(
    tenantId: string,
    guestId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<GuestProfileMetrics> {
    return withTenantTransaction(tenantId, async (tx) => {
      const where = bookingPropertyWhere(tenantId, guestId, allowedPropertyIds);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const [stayCount, agg, propertyRows] = await Promise.all([
        tx.booking.count({ where }),
        tx.booking.aggregate({
          where,
          _min: { checkIn: true },
          _max: { checkOut: true },
        }),
        tx.booking.findMany({
          where,
          select: { propertyId: true },
          distinct: ["propertyId"],
        }),
      ]);

      const future = await tx.booking.findFirst({
        where: {
          ...where,
          checkIn: { gte: today },
        },
        orderBy: { checkIn: "asc" },
        select: { checkIn: true },
      });

      const past = await tx.booking.findFirst({
        where: {
          ...where,
          checkOut: { lt: today },
        },
        orderBy: { checkOut: "desc" },
        select: { checkOut: true },
      });

      return {
        stayCount,
        firstStayCheckIn: formatDateColumn(agg._min.checkIn),
        lastStayCheckOut: formatDateColumn(past?.checkOut ?? null),
        nextStayCheckIn: formatDateColumn(future?.checkIn ?? null),
        propertyIdsVisited: propertyRows.map((r) => r.propertyId),
      };
    });
  }

  async listVisibleBookingsForGuest(params: {
    tenantId: string;
    guestId: string;
    allowedPropertyIds: string[] | null;
    page: number;
    limit: number;
  }): Promise<{
    data: Array<{
      id: string;
      propertyId: string;
      unitId: string;
      checkIn: string;
      checkOut: string;
      status: string;
      guestCount: number;
      guestName: string;
      source: string | null;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    return withTenantTransaction(params.tenantId, async (tx) => {
      const where = bookingPropertyWhere(
        params.tenantId,
        params.guestId,
        params.allowedPropertyIds,
      );
      const skip = (params.page - 1) * params.limit;

      const [total, rows] = await Promise.all([
        tx.booking.count({ where }),
        tx.booking.findMany({
          where,
          orderBy: [{ checkIn: "desc" }, { createdAt: "desc" }],
          skip,
          take: params.limit,
          select: {
            id: true,
            propertyId: true,
            unitId: true,
            checkIn: true,
            checkOut: true,
            status: true,
            guestCount: true,
            guestName: true,
          },
        }),
      ]);

      return {
        data: rows.map((r) => ({
          id: r.id,
          propertyId: r.propertyId,
          unitId: r.unitId,
          checkIn: formatDateColumn(r.checkIn)!,
          checkOut: formatDateColumn(r.checkOut)!,
          status: r.status,
          guestCount: r.guestCount,
          guestName: r.guestName,
          source: null,
        })),
        total,
        page: params.page,
        limit: params.limit,
      };
    });
  }
}
