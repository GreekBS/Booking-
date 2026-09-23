import { cache } from "react";
import { auth } from "@/lib/auth/config";
import {
  resolveTenantContextUseCase,
  userRepository,
} from "@/lib/di/container";
import { UnauthorizedError, ForbiddenError } from "@hcp/domain";
import type { TenantRole } from "@hcp/domain";

export interface SessionActor {
  userId: string;
  email: string;
  /** Authoritative DB platformRole — never trust JWT claim for privilege. */
  platformRole: "super_admin" | null;
  activeTenantId: string | null;
}

export interface TenantActor extends SessionActor {
  tenantId: string;
  role: TenantRole | "super_admin";
  propertyIds: string[] | null;
  isSuperAdmin: boolean;
}

/**
 * Request-scoped Auth.js session read (React cache).
 * Dedupes repeated auth() within one RSC/route request only — never cross-request.
 */
export const getAuthSession = cache(async () => auth());

/**
 * Authenticated identity from JWT (`session.user.id` ← `sub`), with
 * `platformRole` hydrated from the database on every request.
 *
 * middleware may still use JWT platformRole as a UX filter only.
 * This function is the security authority for server-side privilege.
 *
 * Request-scoped memoization only (React cache) — DB remains authoritative;
 * no JWT privilege shortcut; no cross-request cache.
 */
export const requireSession = cache(async (): Promise<SessionActor> => {
  const session = await getAuthSession();

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  const userId = session.user.id;
  const jwtRole = session.user.platformRole ?? null;

  let user;
  try {
    user = await userRepository.findById(userId);
  } catch {
    // Fail closed: never fall back to JWT platformRole on infrastructure errors.
    throw new ForbiddenError("Unable to verify platform authority");
  }

  if (!user) {
    throw new UnauthorizedError();
  }

  const platformRole = user.platformRole;

  if (jwtRole === "super_admin" && platformRole !== "super_admin") {
    console.warn(
      "[auth] platformRole mismatch: JWT claimed super_admin, DB role is null",
      { userId },
    );
  }

  return {
    userId,
    email: session.user.email ?? user.toProps().email,
    platformRole,
    activeTenantId: session.user.activeTenantId,
  };
});

export async function requireSuperAdmin(): Promise<SessionActor> {
  const actor = await requireSession();
  if (actor.platformRole !== "super_admin") {
    throw new ForbiddenError("Super admin access required");
  }
  return actor;
}

/**
 * Tenant context for admin APIs. Request-scoped memoization by tenant header
 * (same request only). User + Tenant authority reads run in parallel;
 * membership is loaded only when required. DB remains authoritative.
 */
export const requireTenantContext = cache(
  async (tenantIdHeader?: string | null): Promise<TenantActor> => {
    const normalizedHeader = tenantIdHeader ?? null;

    const session = await getAuthSession();

    if (!session?.user?.id) {
      throw new UnauthorizedError();
    }

    const tenantId = normalizedHeader ?? session.user.activeTenantId ?? null;
    if (!tenantId) {
      throw new ForbiddenError("Tenant context required");
    }

    let result;
    try {
      result = await resolveTenantContextUseCase.execute({
        userId: session.user.id,
        tenantId,
        jwtPlatformRole: session.user.platformRole ?? null,
      });
    } catch {
      throw new ForbiddenError("Unable to verify platform authority");
    }

    if (result.isFailure) {
      throw result.getError();
    }

    const ctx = result.getValue();

    return {
      userId: ctx.userId,
      email: ctx.email,
      platformRole: ctx.platformRole,
      tenantId: ctx.tenantId,
      role: ctx.role,
      propertyIds: ctx.propertyIds,
      isSuperAdmin: ctx.isSuperAdmin,
      activeTenantId: tenantId,
    };
  },
);

export function toPermissionActor(actor: TenantActor) {
  return {
    userId: actor.userId,
    role: actor.role,
    propertyIds: actor.propertyIds,
    isSuperAdmin: actor.isSuperAdmin,
  };
}

export function serializeProperty(property: {
  id: string;
  tenantId: string;
  name: string;
  slug: { value: string };
  description: string | null;
  type: string;
  status: string;
  timezone: string;
  location: {
    addressLine: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  policies: {
    checkInTime: string;
    checkOutTime: string;
    cancellationPolicyType: string;
  };
  amenityIds: string[];
  units: Array<{
    id: string;
    name: string;
    slug: string;
    maxGuests: number;
    bedrooms: number;
    bathrooms: number;
    status: string;
  }>;
}) {
  return {
    id: property.id,
    tenantId: property.tenantId,
    name: property.name,
    slug: property.slug.value,
    description: property.description,
    type: property.type,
    status: property.status,
    timezone: property.timezone,
    location: property.location,
    policies: property.policies,
    amenityIds: property.amenityIds,
    units: property.units.map((u) => ({
      id: u.id,
      name: u.name,
      slug: u.slug,
      maxGuests: u.maxGuests,
      bedrooms: u.bedrooms,
      bathrooms: u.bathrooms,
      status: u.status,
    })),
  };
}

export function serializeTenant(tenant: {
  id: string;
  name: string;
  slug: { value: string };
  status: string;
  settings: {
    timezone: string;
    defaultLocale: string;
    defaultCurrency: string;
  };
  createdAt: Date;
}) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug.value,
    status: tenant.status,
    settings: {
      timezone: tenant.settings.timezone,
      defaultLocale: tenant.settings.defaultLocale,
      defaultCurrency: tenant.settings.defaultCurrency,
    },
    createdAt: tenant.createdAt.toISOString(),
  };
}

export function getClientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export function serializeHold(hold: {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  stayPeriod: { checkIn: { value: string }; checkOut: { value: string } };
  guestCount: { value: number };
  status: string;
  expiresAt: Date;
  sessionRef: string | null;
}) {
  return {
    id: hold.id,
    tenantId: hold.tenantId,
    unitId: hold.unitId,
    propertyId: hold.propertyId,
    checkIn: hold.stayPeriod.checkIn.value,
    checkOut: hold.stayPeriod.checkOut.value,
    guestCount: hold.guestCount.value,
    status: hold.status,
    expiresAt: hold.expiresAt.toISOString(),
    sessionRef: hold.sessionRef,
  };
}

export function serializeQuote(quote: {
  id: string;
  tenantId: string;
  holdId: string;
  unitId: string;
  propertyId: string;
  snapshotId: string;
  snapshot: {
    currency: string;
    subtotalAmount: string;
    feesAmount: string;
    taxesAmount: string;
    totalAmount: string;
    lineItems: ReadonlyArray<{
      date: string;
      baseAmount: string;
      adjustedAmount: string;
      currency: string;
    }>;
    quotedAt: Date;
  };
  expiresAt: Date;
  createdAt: Date;
}) {
  return {
    id: quote.id,
    tenantId: quote.tenantId,
    holdId: quote.holdId,
    unitId: quote.unitId,
    propertyId: quote.propertyId,
    snapshotId: quote.snapshotId,
    currency: quote.snapshot.currency,
    subtotalAmount: quote.snapshot.subtotalAmount,
    feesAmount: quote.snapshot.feesAmount,
    taxesAmount: quote.snapshot.taxesAmount,
    totalAmount: quote.snapshot.totalAmount,
    lineItems: quote.snapshot.lineItems.map((item) => ({ ...item })),
    quotedAt: quote.snapshot.quotedAt.toISOString(),
    expiresAt: quote.expiresAt.toISOString(),
    createdAt: quote.createdAt.toISOString(),
  };
}

export function serializeBooking(booking: {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  holdId: string;
  quoteId: string;
  quoteSnapshotId: string;
  stayPeriod: { checkIn: { value: string }; checkOut: { value: string } };
  guestCount: { value: number };
  guest: { name: string; email: string; phone: string | null };
  status: string;
  confirmationMode: string;
}) {
  return {
    id: booking.id,
    tenantId: booking.tenantId,
    unitId: booking.unitId,
    propertyId: booking.propertyId,
    holdId: booking.holdId,
    quoteId: booking.quoteId,
    quoteSnapshotId: booking.quoteSnapshotId,
    checkIn: booking.stayPeriod.checkIn.value,
    checkOut: booking.stayPeriod.checkOut.value,
    guestCount: booking.guestCount.value,
    guest: booking.guest,
    status: booking.status,
    confirmationMode: booking.confirmationMode,
  };
}
