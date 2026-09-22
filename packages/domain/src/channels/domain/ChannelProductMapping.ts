import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ChannelSource } from "../types/ChannelSource";

/**
 * Provider-generic channel product mapping (CM-4c-4).
 * Supports property↔hotel, unit↔room, rate↔rate plan, unit+rate↔roomrate.
 */

export const CHANNEL_PRODUCT_MAPPING_KINDS = [
  "property_hotel",
  "unit_room",
  "rate_plan",
  "room_rate",
] as const;

export type ChannelProductMappingKind =
  (typeof CHANNEL_PRODUCT_MAPPING_KINDS)[number];

export type ChannelProductMappingStatus = "active" | "archived";

export interface ChannelProductMappingProps {
  id: string;
  tenantId: string;
  connectionId: string;
  provider: ChannelSource;
  kind: ChannelProductMappingKind;
  propertyId: string | null;
  unitId: string | null;
  ratePlanId: string | null;
  externalHotelId: string | null;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
  /** Opaque composite when provider supplies a distinct roomrate id; else null. */
  externalRoomRateKey: string | null;
  status: ChannelProductMappingStatus;
  mappingVersion: number;
  /** Connection-scoped generation captured when this mapping row was last written. */
  mappingConfigGeneration: number;
  createdAt: Date;
  updatedAt: Date;
}

function requireId(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 255) {
    throw new ValidationError(`${label} must be between 1 and 255 characters`);
  }
  return trimmed;
}

function optionalId(value: string | null | undefined, label: string): string | null {
  if (value == null) return null;
  return requireId(value, label);
}

export class ChannelProductMapping extends AggregateRoot<ChannelProductMappingProps> {
  private constructor(props: ChannelProductMappingProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get connectionId(): string {
    return this.props.connectionId;
  }
  get provider(): ChannelSource {
    return this.props.provider;
  }
  get kind(): ChannelProductMappingKind {
    return this.props.kind;
  }
  get propertyId(): string | null {
    return this.props.propertyId;
  }
  get unitId(): string | null {
    return this.props.unitId;
  }
  get ratePlanId(): string | null {
    return this.props.ratePlanId;
  }
  get externalHotelId(): string | null {
    return this.props.externalHotelId;
  }
  get externalRoomTypeId(): string | null {
    return this.props.externalRoomTypeId;
  }
  get externalRatePlanId(): string | null {
    return this.props.externalRatePlanId;
  }
  get externalRoomRateKey(): string | null {
    return this.props.externalRoomRateKey;
  }
  get status(): ChannelProductMappingStatus {
    return this.props.status;
  }
  get mappingVersion(): number {
    return this.props.mappingVersion;
  }
  get mappingConfigGeneration(): number {
    return this.props.mappingConfigGeneration;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static createActive(input: {
    id: string;
    tenantId: string;
    connectionId: string;
    provider: ChannelSource;
    kind: ChannelProductMappingKind;
    propertyId?: string | null;
    unitId?: string | null;
    ratePlanId?: string | null;
    externalHotelId?: string | null;
    externalRoomTypeId?: string | null;
    externalRatePlanId?: string | null;
    externalRoomRateKey?: string | null;
    mappingConfigGeneration: number;
    now?: Date;
  }): ChannelProductMapping {
    const now = input.now ?? new Date();
    const props: ChannelProductMappingProps = {
      id: requireId(input.id, "Mapping id"),
      tenantId: requireId(input.tenantId, "Tenant id"),
      connectionId: requireId(input.connectionId, "Connection id"),
      provider: input.provider,
      kind: input.kind,
      propertyId: optionalId(input.propertyId, "Property id"),
      unitId: optionalId(input.unitId, "Unit id"),
      ratePlanId: optionalId(input.ratePlanId, "Rate plan id"),
      externalHotelId: optionalId(input.externalHotelId, "External hotel id"),
      externalRoomTypeId: optionalId(input.externalRoomTypeId, "External room type id"),
      externalRatePlanId: optionalId(input.externalRatePlanId, "External rate plan id"),
      externalRoomRateKey: optionalId(input.externalRoomRateKey, "External roomrate key"),
      status: "active",
      mappingVersion: 1,
      mappingConfigGeneration: input.mappingConfigGeneration,
      createdAt: now,
      updatedAt: now,
    };
    assertKindShape(props);
    return new ChannelProductMapping(props);
  }

  static reconstitute(props: ChannelProductMappingProps): ChannelProductMapping {
    assertKindShape(props);
    return new ChannelProductMapping({ ...props });
  }

  toProps(): ChannelProductMappingProps {
    return { ...this.props };
  }

  replaceBinding(
    next: Partial<
      Pick<
        ChannelProductMappingProps,
        | "propertyId"
        | "unitId"
        | "ratePlanId"
        | "externalHotelId"
        | "externalRoomTypeId"
        | "externalRatePlanId"
        | "externalRoomRateKey"
      >
    >,
    mappingConfigGeneration: number,
    now: Date = new Date(),
  ): void {
    if (this.props.status !== "active") {
      throw new ValidationError("Only active mappings can be updated");
    }
    Object.assign(this.props, next);
    assertKindShape(this.props);
    this.props.mappingVersion += 1;
    this.props.mappingConfigGeneration = mappingConfigGeneration;
    this.props.updatedAt = now;
  }

  /** Connection-scoped config generation stamp without changing binding version. */
  stampMappingConfigGeneration(
    mappingConfigGeneration: number,
    now: Date = new Date(),
  ): void {
    if (this.props.status !== "active") {
      throw new ValidationError("Only active mappings can be stamped");
    }
    this.props.mappingConfigGeneration = mappingConfigGeneration;
    this.props.updatedAt = now;
  }

  archive(now: Date = new Date()): void {
    if (this.props.status === "archived") return;
    this.props.status = "archived";
    this.props.updatedAt = now;
  }
}

function assertKindShape(props: ChannelProductMappingProps): void {
  switch (props.kind) {
    case "property_hotel":
      if (!props.propertyId || !props.externalHotelId) {
        throw new ValidationError("property_hotel mapping requires propertyId and externalHotelId");
      }
      break;
    case "unit_room":
      if (!props.propertyId || !props.unitId || !props.externalHotelId || !props.externalRoomTypeId) {
        throw new ValidationError(
          "unit_room mapping requires propertyId, unitId, externalHotelId, externalRoomTypeId",
        );
      }
      break;
    case "rate_plan":
      if (!props.unitId || !props.ratePlanId || !props.externalHotelId || !props.externalRatePlanId) {
        throw new ValidationError(
          "rate_plan mapping requires unitId, ratePlanId, externalHotelId, externalRatePlanId",
        );
      }
      break;
    case "room_rate":
      if (
        !props.unitId ||
        !props.ratePlanId ||
        !props.externalHotelId ||
        !props.externalRoomTypeId ||
        !props.externalRatePlanId
      ) {
        throw new ValidationError(
          "room_rate mapping requires unitId, ratePlanId, hotel, room type, and rate plan ids",
        );
      }
      break;
    default:
      throw new ValidationError("Unknown channel product mapping kind");
  }
}
