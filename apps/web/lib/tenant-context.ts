import { auth } from "@/lib/auth/config";
import { resolveTenantContextUseCase } from "@/lib/di/container";
import { UnauthorizedError, ForbiddenError } from "@hcp/domain";
import type { TenantRole } from "@hcp/domain";

export interface SessionActor {
  userId: string;
  email: string;
  platformRole: "super_admin" | null;
  activeTenantId: string | null;
}

export interface TenantActor extends SessionActor {
  tenantId: string;
  role: TenantRole | "super_admin";
  propertyIds: string[] | null;
  isSuperAdmin: boolean;
}

export async function requireSession(): Promise<SessionActor> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    platformRole: session.user.platformRole,
    activeTenantId: session.user.activeTenantId,
  };
}

export async function requireSuperAdmin(): Promise<SessionActor> {
  const actor = await requireSession();
  if (actor.platformRole !== "super_admin") {
    throw new ForbiddenError("Super admin access required");
  }
  return actor;
}

export async function requireTenantContext(
  tenantIdHeader?: string | null,
): Promise<TenantActor> {
  const actor = await requireSession();
  const tenantId = tenantIdHeader ?? actor.activeTenantId;

  if (!tenantId) {
    throw new ForbiddenError("Tenant context required");
  }

  const result = await resolveTenantContextUseCase.execute({
    userId: actor.userId,
    platformRole: actor.platformRole,
    tenantId,
  });

  if (result.isFailure) {
    throw result.getError();
  }

  const ctx = result.getValue();

  return {
    ...actor,
    tenantId: ctx.tenantId,
    role: ctx.role,
    propertyIds: ctx.propertyIds,
    isSuperAdmin: ctx.isSuperAdmin,
    activeTenantId: tenantId,
  };
}

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
