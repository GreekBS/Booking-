export class AdminApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

interface AdminFetchOptions extends RequestInit {
  tenantId?: string;
}

import type { PaginatedBookings, PaginatedProperties, OperatorBlockType } from "./types";

export async function adminFetch<T>(path: string, options: AdminFetchOptions = {}): Promise<T> {
  const { tenantId, ...init } = options;
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (tenantId) {
    headers.set("X-Tenant-Id", tenantId);
  }

  const response = await fetch(`/api/admin/v1${path}`, {
    ...init,
    headers,
  });

  const payload = (await response.json()) as {
    error?: { code?: string; message?: string };
  } & T;

  if (!response.ok) {
    throw new AdminApiError(
      payload.error?.code ?? "REQUEST_FAILED",
      payload.error?.message ?? "Request failed",
      response.status,
    );
  }

  return payload as T;
}

const propertiesCache = new Map<string, PaginatedProperties>();
const propertiesInflight = new Map<string, Promise<PaginatedProperties>>();

const catalogCache = new Map<string, import("./types").PropertyUnitCatalog>();
const catalogInflight = new Map<string, Promise<import("./types").PropertyUnitCatalog>>();

const calendarCache = new Map<string, import("./types").CalendarRecord>();
const calendarInflight = new Map<string, Promise<import("./types").CalendarRecord>>();

const batchCalendarCache = new Map<
  string,
  Record<string, import("./types").CalendarRecord>
>();
const batchCalendarInflight = new Map<
  string,
  Promise<Record<string, import("./types").CalendarRecord>>
>();

const batchRatePlansCache = new Map<
  string,
  Record<string, import("./types").RatePlanRecord | null>
>();
const batchRatePlansInflight = new Map<
  string,
  Promise<Record<string, import("./types").RatePlanRecord | null>>
>();

const batchRulesCache = new Map<
  string,
  Record<string, import("./types").AvailabilityRulesRecord>
>();
const batchRulesInflight = new Map<
  string,
  Promise<Record<string, import("./types").AvailabilityRulesRecord>>
>();

function calendarCacheKey(tenantId: string, unitId: string, from: string, to: string): string {
  return `${tenantId}:${unitId}:${from}:${to}`;
}

function batchCalendarCacheKey(
  tenantId: string,
  unitIds: string[],
  from: string,
  to: string,
): string {
  return `${tenantId}:${[...unitIds].sort().join(",")}:${from}:${to}`;
}

function batchUnitIdsCacheKey(tenantId: string, unitIds: string[]): string {
  return `${tenantId}:${[...unitIds].sort().join(",")}`;
}

export function invalidateUnitCalendarCache(tenantId?: string, unitId?: string): void {
  if (!tenantId) {
    calendarCache.clear();
    calendarInflight.clear();
    batchCalendarCache.clear();
    batchCalendarInflight.clear();
    return;
  }
  const prefix = unitId ? `${tenantId}:${unitId}:` : `${tenantId}:`;
  for (const key of calendarCache.keys()) {
    if (key.startsWith(prefix)) calendarCache.delete(key);
  }
  for (const key of calendarInflight.keys()) {
    if (key.startsWith(prefix)) calendarInflight.delete(key);
  }
  // Batch keys embed sorted unit id lists — clear all tenant batch calendar entries.
  const tenantPrefix = `${tenantId}:`;
  for (const key of batchCalendarCache.keys()) {
    if (key.startsWith(tenantPrefix)) batchCalendarCache.delete(key);
  }
  for (const key of batchCalendarInflight.keys()) {
    if (key.startsWith(tenantPrefix)) batchCalendarInflight.delete(key);
  }
}

export function invalidateRatePlansBatchCache(tenantId?: string): void {
  if (!tenantId) {
    batchRatePlansCache.clear();
    batchRatePlansInflight.clear();
    return;
  }
  const prefix = `${tenantId}:`;
  for (const key of batchRatePlansCache.keys()) {
    if (key.startsWith(prefix)) batchRatePlansCache.delete(key);
  }
  for (const key of batchRatePlansInflight.keys()) {
    if (key.startsWith(prefix)) batchRatePlansInflight.delete(key);
  }
}

export function invalidateAvailabilityRulesBatchCache(tenantId?: string): void {
  if (!tenantId) {
    batchRulesCache.clear();
    batchRulesInflight.clear();
    return;
  }
  const prefix = `${tenantId}:`;
  for (const key of batchRulesCache.keys()) {
    if (key.startsWith(prefix)) batchRulesCache.delete(key);
  }
  for (const key of batchRulesInflight.keys()) {
    if (key.startsWith(prefix)) batchRulesInflight.delete(key);
  }
}

function propertiesCacheKey(tenantId: string, page: number, limit: number): string {
  return `${tenantId}:${page}:${limit}`;
}

/** Clears session-scoped property list cache (all pages/limits for tenant, or entire cache). */
export function invalidatePropertiesCache(tenantId?: string): void {
  if (!tenantId) {
    propertiesCache.clear();
    propertiesInflight.clear();
    catalogCache.clear();
    catalogInflight.clear();
    return;
  }
  const prefix = `${tenantId}:`;
  for (const key of propertiesCache.keys()) {
    if (key.startsWith(prefix)) propertiesCache.delete(key);
  }
  for (const key of propertiesInflight.keys()) {
    if (key.startsWith(prefix)) propertiesInflight.delete(key);
  }
  catalogCache.delete(tenantId);
  catalogInflight.delete(tenantId);
}

export async function searchBookings(
  tenantId: string,
  params: Record<string, string | number | undefined>,
): Promise<PaginatedBookings> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== "all") {
      query.set(key, String(value));
    }
  }
  return adminFetch(`/bookings?${query.toString()}`, { tenantId });
}

export async function fetchAllBookings(
  tenantId: string,
  opts?: { propertyId?: string },
): Promise<import("./types").BookingRecord[]> {
  const result = await searchBookings(tenantId, {
    page: 1,
    limit: 100,
    propertyId: opts?.propertyId,
  });
  return result.data ?? [];
}

export async function fetchAllProperties(
  tenantId: string,
  page = 1,
  limit = 100,
): Promise<PaginatedProperties> {
  const key = propertiesCacheKey(tenantId, page, limit);
  const cached = propertiesCache.get(key);
  if (cached) {
    return cached;
  }

  let inflight = propertiesInflight.get(key);
  if (!inflight) {
    inflight = adminFetch<PaginatedProperties>(`/properties?page=${page}&limit=${limit}`, {
      tenantId,
    })
      .then((data) => {
        propertiesCache.set(key, data);
        propertiesInflight.delete(key);
        return data;
      })
      .catch((err) => {
        propertiesInflight.delete(key);
        throw err;
      });
    propertiesInflight.set(key, inflight);
  }

  return inflight;
}

/** Slim property/unit catalog for pickers — prefer over fetchAllProperties when details are unused. */
export async function fetchPropertyUnitCatalog(
  tenantId: string,
): Promise<import("./types").PropertyUnitCatalog> {
  const cached = catalogCache.get(tenantId);
  if (cached) return cached;

  let inflight = catalogInflight.get(tenantId);
  if (!inflight) {
    inflight = adminFetch<import("./types").PropertyUnitCatalog>(
      "/catalog/properties-units",
      { tenantId },
    )
      .then((data) => {
        catalogCache.set(tenantId, data);
        catalogInflight.delete(tenantId);
        return data;
      })
      .catch((err) => {
        catalogInflight.delete(tenantId);
        throw err;
      });
    catalogInflight.set(tenantId, inflight);
  }
  return inflight;
}

export function invalidatePropertyUnitCatalogCache(tenantId?: string): void {
  if (!tenantId) {
    catalogCache.clear();
    catalogInflight.clear();
    return;
  }
  catalogCache.delete(tenantId);
  catalogInflight.delete(tenantId);
}

export function flattenCatalogUnits(
  catalog: import("./types").PropertyUnitCatalog,
): Array<{
  id: string;
  name: string;
  status: string;
  propertyId: string;
  propertyName: string;
}> {
  return catalog.properties.flatMap((property) =>
    property.units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      status: unit.status,
      propertyId: property.id,
      propertyName: property.name,
    })),
  );
}

/** Single-shot dashboard overview — no quote-per-booking fan-out.
 * Concurrent callers (e.g. Strict Mode remount) share one in-flight request per tenant.
 * Not a durable cache — cleared when the promise settles.
 */
const overviewInflight = new Map<
  string,
  Promise<import("./types").DashboardOverviewRecord>
>();

export async function fetchDashboardOverview(
  tenantId: string,
  propertyId?: string | null,
): Promise<import("./types").DashboardOverviewRecord> {
  const cacheKey = propertyId ? `${tenantId}:${propertyId}` : tenantId;
  const existing = overviewInflight.get(cacheKey);
  if (existing) return existing;

  const query = propertyId
    ? `?propertyId=${encodeURIComponent(propertyId)}`
    : "";
  const pending = adminFetch<import("./types").DashboardOverviewRecord>(
    `/dashboard/overview${query}`,
    { tenantId },
  ).finally(() => {
    overviewInflight.delete(cacheKey);
  });
  overviewInflight.set(cacheKey, pending);
  return pending;
}

/** Clear property-sensitive in-flight/overview caches after active property switch. */
export function invalidateActivePropertyScopedCaches(tenantId?: string): void {
  if (!tenantId) {
    overviewInflight.clear();
    invalidateUnitCalendarCache();
    invalidateRatePlansBatchCache();
    invalidateAvailabilityRulesBatchCache();
    return;
  }
  const prefix = `${tenantId}:`;
  for (const key of overviewInflight.keys()) {
    if (key === tenantId || key.startsWith(prefix)) {
      overviewInflight.delete(key);
    }
  }
  invalidateUnitCalendarCache(tenantId);
  invalidateRatePlansBatchCache(tenantId);
  invalidateAvailabilityRulesBatchCache(tenantId);
}

export function flattenUnits(properties: import("./types").PropertyRecord[]): import("./types").FlatUnit[] {
  return properties.flatMap((property) =>
    property.units.map((unit) => ({
      ...unit,
      propertyId: property.id,
      propertyName: property.name,
    })),
  );
}

export async function fetchQuote(
  tenantId: string,
  quoteId: string,
): Promise<import("./types").QuoteRecord> {
  return adminFetch(`/quotes/${quoteId}`, { tenantId });
}

export async function fetchBookingDetail(
  tenantId: string,
  bookingId: string,
): Promise<import("./types").BookingRecord> {
  return adminFetch(`/bookings/${bookingId}`, { tenantId });
}

export async function previewBookingStayChange(
  tenantId: string,
  bookingId: string,
  body: {
    unitId: string;
    checkIn: string;
    checkOut: string;
    guestCount: number;
  },
): Promise<import("./types").StayChangePreviewRecord> {
  return adminFetch(`/bookings/${bookingId}/change-stay/preview`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function commitBookingStayChange(
  tenantId: string,
  bookingId: string,
  body: {
    unitId: string;
    checkIn: string;
    checkOut: string;
    guestCount: number;
  },
): Promise<import("./types").BookingRecord> {
  invalidateUnitCalendarCache(tenantId);
  return adminFetch(`/bookings/${bookingId}/change-stay`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function fetchUnitCalendar(
  tenantId: string,
  unitId: string,
  from: string,
  to: string,
): Promise<import("./types").CalendarRecord> {
  const key = calendarCacheKey(tenantId, unitId, from, to);
  const cached = calendarCache.get(key);
  if (cached) return cached;

  let inflight = calendarInflight.get(key);
  if (!inflight) {
    const query = new URLSearchParams({ from, to });
    inflight = adminFetch<import("./types").CalendarRecord>(
      `/units/${unitId}/calendar?${query.toString()}`,
      { tenantId },
    )
      .then((data) => {
        calendarCache.set(key, data);
        calendarInflight.delete(key);
        return data;
      })
      .catch((err) => {
        calendarInflight.delete(key);
        throw err;
      });
    calendarInflight.set(key, inflight);
  }
  return inflight;
}

/** Batched calendars for Availability — one HTTP call for many units. */
export async function fetchUnitsCalendarBatch(
  tenantId: string,
  unitIds: string[],
  from: string,
  to: string,
): Promise<Record<string, import("./types").CalendarRecord>> {
  if (unitIds.length === 0) return {};
  const key = batchCalendarCacheKey(tenantId, unitIds, from, to);
  const cached = batchCalendarCache.get(key);
  if (cached) return cached;

  let inflight = batchCalendarInflight.get(key);
  if (!inflight) {
    inflight = adminFetch<{ units: Record<string, import("./types").CalendarRecord> }>(
      "/calendar/batch",
      {
        method: "POST",
        tenantId,
        body: JSON.stringify({ unitIds, from, to }),
      },
    )
      .then((payload) => {
        const units = payload.units ?? {};
        batchCalendarCache.set(key, units);
        batchCalendarInflight.delete(key);
        return units;
      })
      .catch((err) => {
        batchCalendarInflight.delete(key);
        throw err;
      });
    batchCalendarInflight.set(key, inflight);
  }
  return inflight;
}

export async function fetchUnitsRatePlansBatch(
  tenantId: string,
  unitIds: string[],
): Promise<Record<string, import("./types").RatePlanRecord | null>> {
  if (unitIds.length === 0) return {};
  const key = batchUnitIdsCacheKey(tenantId, unitIds);
  const cached = batchRatePlansCache.get(key);
  if (cached) return cached;

  let inflight = batchRatePlansInflight.get(key);
  if (!inflight) {
    inflight = adminFetch<{
      units: Record<string, import("./types").RatePlanRecord | null>;
    }>("/rate-plans/batch", {
      method: "POST",
      tenantId,
      body: JSON.stringify({ unitIds }),
    })
      .then((payload) => {
        const units = payload.units ?? {};
        batchRatePlansCache.set(key, units);
        batchRatePlansInflight.delete(key);
        return units;
      })
      .catch((err) => {
        batchRatePlansInflight.delete(key);
        throw err;
      });
    batchRatePlansInflight.set(key, inflight);
  }
  return inflight;
}

export async function fetchUnitsAvailabilityRulesBatch(
  tenantId: string,
  unitIds: string[],
): Promise<Record<string, import("./types").AvailabilityRulesRecord>> {
  if (unitIds.length === 0) return {};
  const key = batchUnitIdsCacheKey(tenantId, unitIds);
  const cached = batchRulesCache.get(key);
  if (cached) return cached;

  let inflight = batchRulesInflight.get(key);
  if (!inflight) {
    inflight = adminFetch<{
      units: Record<string, import("./types").AvailabilityRulesRecord>;
    }>("/availability-rules/batch", {
      method: "POST",
      tenantId,
      body: JSON.stringify({ unitIds }),
    })
      .then((payload) => {
        const units = payload.units ?? {};
        batchRulesCache.set(key, units);
        batchRulesInflight.delete(key);
        return units;
      })
      .catch((err) => {
        batchRulesInflight.delete(key);
        throw err;
      });
    batchRulesInflight.set(key, inflight);
  }
  return inflight;
}

export async function fetchAvailabilityRules(
  tenantId: string,
  unitId: string,
): Promise<import("./types").AvailabilityRulesRecord> {
  return adminFetch(`/units/${unitId}/availability-rules`, { tenantId });
}

export async function updateAvailabilityRules(
  tenantId: string,
  unitId: string,
  rules: import("./types").AvailabilityRulesRecord,
): Promise<import("./types").AvailabilityRulesRecord> {
  invalidateUnitCalendarCache(tenantId, unitId);
  invalidateAvailabilityRulesBatchCache(tenantId);
  return adminFetch(`/units/${unitId}/availability-rules`, {
    method: "PUT",
    tenantId,
    body: JSON.stringify(rules),
  });
}

export async function fetchRatePlan(
  tenantId: string,
  unitId: string,
): Promise<import("./types").RatePlanRecord | null> {
  return adminFetch<import("./types").RatePlanRecord | null>(`/units/${unitId}/rate-plan`, {
    tenantId,
  });
}

export async function updateRatePlan(
  tenantId: string,
  unitId: string,
  plan: import("./types").RatePlanRecord,
): Promise<import("./types").RatePlanRecord> {
  invalidateRatePlansBatchCache(tenantId);
  return adminFetch(`/units/${unitId}/rate-plan`, {
    method: "PUT",
    tenantId,
    body: JSON.stringify(plan),
  });
}

export async function createOperatorBlock(
  tenantId: string,
  unitId: string,
  body: {
    checkIn: string;
    checkOut: string;
    blockType?: OperatorBlockType;
    reason?: string | null;
  },
): Promise<{ blockId: string }> {
  invalidateUnitCalendarCache(tenantId, unitId);
  return adminFetch(`/units/${unitId}/blocks`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function releaseOperatorBlock(
  tenantId: string,
  unitId: string,
  blockId: string,
): Promise<void> {
  invalidateUnitCalendarCache(tenantId, unitId);
  await adminFetch(`/units/${unitId}/blocks/${blockId}`, {
    method: "DELETE",
    tenantId,
  });
}

export async function fetchHoldDetail(
  tenantId: string,
  holdId: string,
): Promise<import("./types").HoldRecord> {
  return adminFetch(`/holds/${holdId}`, { tenantId });
}

export async function releaseHold(tenantId: string, holdId: string): Promise<void> {
  invalidateUnitCalendarCache(tenantId);
  await adminFetch(`/holds/${holdId}/release`, { method: "POST", tenantId });
}

/** @deprecated Use fetchUnitsCalendarBatch */
export async function fetchAllCalendars(
  tenantId: string,
  unitIds: string[],
  from: string,
  to: string,
): Promise<import("./types").CalendarRecord[]> {
  const byUnit = await fetchUnitsCalendarBatch(tenantId, unitIds, from, to);
  return unitIds.map(
    (unitId) => byUnit[unitId] ?? { blocks: [], holds: [], bookings: [] },
  );
}

export async function countActiveHolds(tenantId: string): Promise<number> {
  try {
    const res = await adminFetch<{ data: import("./types").HoldRecord[] }>("/holds", { tenantId });
    return res.data?.length ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchTenantSettings(tenantId: string) {
  return adminFetch<import("./types").TenantSettingsRecord>("/settings/tenant", { tenantId });
}

export async function updateTenantSettings(
  tenantId: string,
  body: Partial<import("./types").TenantSettingsRecord>,
) {
  return adminFetch<import("./types").TenantSettingsRecord>("/settings/tenant", {
    method: "PATCH",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function fetchCommerceSettings(tenantId: string) {
  return adminFetch<import("./types").CommerceSettingsRecord>("/settings/commerce", { tenantId });
}

export async function updateCommerceSettings(
  tenantId: string,
  body: Partial<Pick<import("./types").CommerceSettingsRecord, "defaultHoldTtlSeconds" | "confirmationMode" | "defaultCurrency">>,
) {
  return adminFetch<import("./types").CommerceSettingsRecord>("/settings/commerce", {
    method: "PATCH",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function fetchPublishableKeys(tenantId: string) {
  return adminFetch<{ data: import("./types").PublishableKeyRecord[] }>("/settings/publishable-keys", {
    tenantId,
  });
}

export async function createPublishableKey(
  tenantId: string,
  environment: "test" | "live",
  allowedDomains?: string[],
) {
  return adminFetch<{
    id: string;
    publishableKey: string;
    environment: string;
    allowedDomains: string[];
  }>("/settings/publishable-keys", {
    method: "POST",
    tenantId,
    body: JSON.stringify({ environment, allowedDomains }),
  });
}

export async function revokePublishableKey(tenantId: string, keyId: string) {
  return adminFetch(`/settings/publishable-keys/${keyId}`, {
    method: "DELETE",
    tenantId,
  });
}

export async function updatePublishableKeyDomains(
  tenantId: string,
  keyId: string,
  allowedDomains: string[],
) {
  return adminFetch<import("./types").PublishableKeyRecord>(`/settings/publishable-keys/${keyId}`, {
    method: "PATCH",
    tenantId,
    body: JSON.stringify({ allowedDomains }),
  });
}

function guestListQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== false) {
      query.set(key, String(value));
    }
  }
  return query.toString();
}

export function mapGuestDirectoryRow(row: import("./types").GuestDirectoryRow): import("./types").GuestRecord {
  return {
    id: row.guest.id,
    displayName: row.guest.displayName,
    email: row.guest.email,
    phone: row.guest.phone,
    stayCount: row.metrics.stayCount,
    lastStayCheckOut: row.metrics.lastStayCheckOut,
    nextStayCheckIn: row.metrics.nextStayCheckIn,
    tags: row.tags,
  };
}

export async function searchGuests(
  tenantId: string,
  params: {
    propertyId?: string;
    entireTenant?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    includeArchived?: boolean;
  },
): Promise<import("./types").PaginatedGuestDirectory> {
  const qs = guestListQuery({
    propertyId: params.entireTenant ? undefined : params.propertyId,
    entireTenant: params.entireTenant ? true : undefined,
    search: params.search,
    page: params.page,
    limit: params.limit,
    includeArchived: params.includeArchived,
  });
  return adminFetch(`/guests?${qs}`, { tenantId });
}

export async function getGuestProfile(
  tenantId: string,
  guestId: string,
): Promise<import("./types").GuestProfileRecord> {
  return adminFetch(`/guests/${guestId}`, { tenantId });
}

export async function updateGuest(
  tenantId: string,
  guestId: string,
  body: Partial<import("./types").GuestContactInput>,
): Promise<import("./types").GuestIdentityRecord> {
  return adminFetch(`/guests/${guestId}`, {
    method: "PATCH",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function createGuest(
  tenantId: string,
  body: import("./types").GuestContactInput,
): Promise<import("./types").GuestIdentityRecord> {
  return adminFetch("/guests", {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function listGuestNotes(
  tenantId: string,
  guestId: string,
): Promise<{ data: import("./types").GuestNoteRecord[] }> {
  return adminFetch(`/guests/${guestId}/notes`, { tenantId });
}

export async function addGuestNote(
  tenantId: string,
  guestId: string,
  body: { body: string; propertyId?: string | null },
): Promise<import("./types").GuestNoteRecord> {
  return adminFetch(`/guests/${guestId}/notes`, {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function listGuestReservations(
  tenantId: string,
  guestId: string,
  params?: { page?: number; limit?: number },
): Promise<import("./types").PaginatedGuestReservations> {
  const qs = guestListQuery({ page: params?.page, limit: params?.limit });
  return adminFetch(`/guests/${guestId}/reservations?${qs}`, { tenantId });
}

export async function listGuestTags(
  tenantId: string,
): Promise<{ data: import("./types").GuestTagRecord[] }> {
  return adminFetch("/guest-tags", { tenantId });
}

export async function createGuestTag(
  tenantId: string,
  name: string,
): Promise<import("./types").GuestTagRecord> {
  return adminFetch("/guest-tags", {
    method: "POST",
    tenantId,
    body: JSON.stringify({ name }),
  });
}

export async function assignGuestTag(
  tenantId: string,
  guestId: string,
  tagId: string,
): Promise<void> {
  await adminFetch(`/guests/${guestId}/tags/${tagId}`, {
    method: "POST",
    tenantId,
  });
}

export async function unassignGuestTag(
  tenantId: string,
  guestId: string,
  tagId: string,
): Promise<void> {
  await adminFetch(`/guests/${guestId}/tags/${tagId}`, {
    method: "DELETE",
    tenantId,
  });
}

export async function searchGuestsForBooking(
  tenantId: string,
  params: { propertyId: string; search: string; limit?: number },
): Promise<{ data: import("./types").GuestBookingSelectionRecord[] }> {
  const qs = guestListQuery({
    propertyId: params.propertyId,
    search: params.search,
    limit: params.limit,
  });
  return adminFetch(`/guests/search-for-booking?${qs}`, { tenantId });
}

export async function getGuestForBookingSelection(
  tenantId: string,
  params: { guestId: string; propertyId: string },
): Promise<import("./types").GuestBookingSelectionRecord> {
  const qs = guestListQuery({
    guestId: params.guestId,
    propertyId: params.propertyId,
  });
  return adminFetch(`/guests/search-for-booking?${qs}`, { tenantId });
}

export async function createManualBooking(
  tenantId: string,
  body: {
    unitId: string;
    checkIn: string;
    checkOut: string;
    guestCount: number;
    guest: { name: string; email: string; phone?: string | null };
    guestId?: string | null;
    confirm?: boolean;
  },
) {
  return adminFetch("/bookings/manual", {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}

export async function estimateRevenueFromBookings(
  tenantId: string,
  bookings: import("./types").BookingRecord[],
): Promise<{ total: number; currency: string } | null> {
  const confirmed = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
  if (confirmed.length === 0) return null;

  const quotes = await Promise.all(
    confirmed.slice(0, 50).map(async (b) => {
      try {
        return await fetchQuote(tenantId, b.quoteId);
      } catch {
        return null;
      }
    }),
  );

  const valid = quotes.filter(Boolean) as import("./types").QuoteRecord[];
  if (valid.length === 0) return null;

  const total = valid.reduce((sum, q) => sum + Number.parseFloat(q.totalAmount), 0);
  return { total, currency: valid[0]!.currency };
}

export async function createQuoteFromHold(
  tenantId: string,
  holdId: string,
): Promise<import("./types").QuoteRecord> {
  return adminFetch("/quotes", {
    method: "POST",
    tenantId,
    body: JSON.stringify({ holdId }),
  });
}

export type StayPricingPreview = {
  currency: string;
  subtotalAmount: string;
  losDiscountAmount: string;
  totalAmount: string;
  quotedAt: string;
  lineItems: Array<{
    date: string;
    baseAmount: string;
    adjustedAmount: string;
    currency: string;
  }>;
  inventoryMutating: false;
};

/** Read-only pricing preview — does not create Hold, Quote, or inventory. */
export async function previewQuoteForStay(
  tenantId: string,
  unitId: string,
  checkIn: string,
  checkOut: string,
  guestCount: number,
): Promise<StayPricingPreview> {
  return adminFetch("/pricing/preview", {
    method: "POST",
    tenantId,
    body: JSON.stringify({ unitId, checkIn, checkOut, guestCount }),
  });
}

export async function createBookingFromQuote(
  tenantId: string,
  body: {
    quoteId: string;
    guest: { name: string; email: string; phone?: string | null };
    guestId?: string | null;
    confirmationMode?: "manual" | "payment_required";
  },
) {
  return adminFetch("/bookings", {
    method: "POST",
    tenantId,
    body: JSON.stringify(body),
  });
}
