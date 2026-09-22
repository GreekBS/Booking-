import type { ChannelProductMapping } from "../../../domain/ChannelProductMapping";
import type { BookingComRemoteDiscoverySnapshot } from "../discovery/IBookingComRemoteDiscoveryClient";
import type { BookingComPricingModel } from "../connections/IBookingComConnectionsClient";

export type BookingComMappingIssueCode =
  | "MISSING_PROPERTY_MAPPING"
  | "MISSING_ROOM_MAPPING"
  | "MISSING_RATE_MAPPING"
  | "MISSING_ROOMRATE_MAPPING"
  | "DUPLICATE_REMOTE_MAPPING"
  | "WRONG_PROPERTY"
  | "INACTIVE_UNIT"
  | "INACTIVE_RATE_PLAN"
  | "STALE_MAPPING_GENERATION"
  | "UNSUPPORTED_PRICING_MODEL";

export type BookingComMappingIssueSeverity = "blocking" | "warning";

export interface BookingComMappingIssue {
  readonly code: BookingComMappingIssueCode;
  readonly severity: BookingComMappingIssueSeverity;
  readonly message: string;
  readonly mappingId?: string;
}

export interface BookingComMappingValidationContext {
  readonly mappings: readonly ChannelProductMapping[];
  readonly expectedPropertyId: string | null;
  readonly activeUnitIds: ReadonlySet<string>;
  readonly activeRatePlanIds: ReadonlySet<string>;
  /** unitId → propertyId */
  readonly unitPropertyIds: ReadonlyMap<string, string>;
  readonly pricingModel: BookingComPricingModel;
  readonly expectedMappingConfigGeneration: number | null;
  readonly discovery: BookingComRemoteDiscoverySnapshot | null;
}

export interface BookingComMappingValidationResult {
  readonly ok: boolean;
  readonly blocking: readonly BookingComMappingIssue[];
  readonly warnings: readonly BookingComMappingIssue[];
}

export function validateBookingComMappings(
  ctx: BookingComMappingValidationContext,
): BookingComMappingValidationResult {
  const blocking: BookingComMappingIssue[] = [];
  const warnings: BookingComMappingIssue[] = [];

  if (ctx.pricingModel !== "Standard") {
    blocking.push({
      code: "UNSUPPORTED_PRICING_MODEL",
      severity: "blocking",
      message: `Pricing model ${ctx.pricingModel} is not supported for V1`,
    });
  }

  const active = ctx.mappings.filter((m) => m.status === "active");
  const propertyMaps = active.filter((m) => m.kind === "property_hotel");
  const roomMaps = active.filter((m) => m.kind === "unit_room");
  const rateMaps = active.filter((m) => m.kind === "rate_plan");
  const roomRateMaps = active.filter((m) => m.kind === "room_rate");

  if (propertyMaps.length === 0) {
    blocking.push({
      code: "MISSING_PROPERTY_MAPPING",
      severity: "blocking",
      message: "Property ↔ hotel mapping is required",
    });
  }
  if (propertyMaps.length > 1) {
    blocking.push({
      code: "DUPLICATE_REMOTE_MAPPING",
      severity: "blocking",
      message: "Only one active property↔hotel mapping is allowed per V1 connection",
    });
  }
  if (
    ctx.expectedPropertyId &&
    propertyMaps[0] &&
    propertyMaps[0].propertyId !== ctx.expectedPropertyId
  ) {
    blocking.push({
      code: "WRONG_PROPERTY",
      severity: "blocking",
      message: "Mapped property does not match expected connection property",
      mappingId: propertyMaps[0].id,
    });
  }

  if (roomMaps.length === 0) {
    blocking.push({
      code: "MISSING_ROOM_MAPPING",
      severity: "blocking",
      message: "At least one Unit ↔ room mapping is required",
    });
  }
  if (rateMaps.length === 0) {
    blocking.push({
      code: "MISSING_RATE_MAPPING",
      severity: "blocking",
      message: "At least one RatePlan ↔ rate mapping is required",
    });
  }
  if (roomRateMaps.length === 0) {
    blocking.push({
      code: "MISSING_ROOMRATE_MAPPING",
      severity: "blocking",
      message: "At least one Unit+RatePlan ↔ roomrate mapping is required",
    });
  }

  assertUniqueRemote(
    roomMaps,
    (m) => m.externalRoomTypeId,
    "room type",
    blocking,
  );
  assertUniqueRemote(
    rateMaps,
    (m) => m.externalRatePlanId,
    "rate plan",
    blocking,
  );
  assertUniqueRemote(
    roomRateMaps,
    (m) =>
      `${m.externalHotelId}:${m.externalRoomTypeId}:${m.externalRatePlanId}`,
    "roomrate",
    blocking,
  );

  for (const m of roomMaps) {
    if (m.unitId && !ctx.activeUnitIds.has(m.unitId)) {
      blocking.push({
        code: "INACTIVE_UNIT",
        severity: "blocking",
        message: `Unit ${m.unitId} is inactive or missing`,
        mappingId: m.id,
      });
    }
    if (
      m.unitId &&
      ctx.unitPropertyIds.get(m.unitId) &&
      m.propertyId &&
      ctx.unitPropertyIds.get(m.unitId) !== m.propertyId
    ) {
      blocking.push({
        code: "WRONG_PROPERTY",
        severity: "blocking",
        message: `Unit ${m.unitId} does not belong to mapped property`,
        mappingId: m.id,
      });
    }
  }

  for (const m of [...rateMaps, ...roomRateMaps]) {
    if (m.ratePlanId && !ctx.activeRatePlanIds.has(m.ratePlanId)) {
      blocking.push({
        code: "INACTIVE_RATE_PLAN",
        severity: "blocking",
        message: `RatePlan ${m.ratePlanId} is inactive or missing`,
        mappingId: m.id,
      });
    }
  }

  if (ctx.expectedMappingConfigGeneration != null) {
    for (const m of active) {
      if (m.mappingConfigGeneration !== ctx.expectedMappingConfigGeneration) {
        blocking.push({
          code: "STALE_MAPPING_GENERATION",
          severity: "blocking",
          message: `Mapping ${m.id} generation ${m.mappingConfigGeneration} != ${ctx.expectedMappingConfigGeneration}`,
          mappingId: m.id,
        });
      }
    }
  }

  if (ctx.discovery) {
    const remoteRooms = new Set<string>(
      ctx.discovery.rooms.map((r) => r.roomTypeId as string),
    );
    for (const m of roomMaps) {
      if (m.externalRoomTypeId && !remoteRooms.has(m.externalRoomTypeId)) {
        warnings.push({
          code: "MISSING_ROOM_MAPPING",
          severity: "warning",
          message: `Mapped room ${m.externalRoomTypeId} not present in remote discovery`,
          mappingId: m.id,
        });
      }
    }
  }

  return {
    ok: blocking.length === 0,
    blocking,
    warnings,
  };
}

function assertUniqueRemote(
  mappings: readonly ChannelProductMapping[],
  keyOf: (m: ChannelProductMapping) => string | null,
  label: string,
  blocking: BookingComMappingIssue[],
): void {
  const seen = new Map<string, string>();
  for (const m of mappings) {
    const k = keyOf(m);
    if (!k) continue;
    const prior = seen.get(k);
    if (prior) {
      blocking.push({
        code: "DUPLICATE_REMOTE_MAPPING",
        severity: "blocking",
        message: `Duplicate remote ${label} mapping for ${k}`,
        mappingId: m.id,
      });
    } else {
      seen.set(k, m.id);
    }
  }
}
