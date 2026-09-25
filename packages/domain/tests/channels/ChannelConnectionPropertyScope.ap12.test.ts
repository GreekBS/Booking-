import { describe, expect, it } from "vitest";
import {
  collectMappedPropertyIds,
  connectionHasPropertyBearingMappings,
  isConnectionRelevantToProperty,
  resolveConnectionRelevantPropertyIds,
} from "../../src/channels/application/channelConnectionPropertyRelevance";
import {
  assertActorCanOperateChannelConnection,
  assertActorCanReadChannelConnection,
  assertActorCanAccessChannelProperty,
} from "../../src/channels/application/ChannelConnectionPropertyAuthorization";
import { PermissionChecker } from "../../src/shared/services/PermissionChecker";
import { ForbiddenError } from "../../src/shared/errors/DomainError";

const PROPERTY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROPERTY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("ChannelConnection property relevance (AP 1.2)", () => {
  it("treats listing mapping as relevant", () => {
    expect(
      isConnectionRelevantToProperty({
        propertyId: PROPERTY_A,
        workspacePropertyId: PROPERTY_B,
        listingMappings: [{ propertyId: PROPERTY_A, status: "active" }],
        productMappings: [],
      }),
    ).toBe(true);
  });

  it("ignores archived mappings", () => {
    expect(
      isConnectionRelevantToProperty({
        propertyId: PROPERTY_A,
        workspacePropertyId: null,
        listingMappings: [{ propertyId: PROPERTY_A, status: "archived" }],
        productMappings: [],
      }),
    ).toBe(false);
  });

  it("uses workspace affinity only while unmapped", () => {
    expect(
      isConnectionRelevantToProperty({
        propertyId: PROPERTY_A,
        workspacePropertyId: PROPERTY_A,
        listingMappings: [],
        productMappings: [],
      }),
    ).toBe(true);

    expect(
      isConnectionRelevantToProperty({
        propertyId: PROPERTY_A,
        workspacePropertyId: PROPERTY_A,
        listingMappings: [{ propertyId: PROPERTY_B, status: "active" }],
        productMappings: [],
      }),
    ).toBe(false);
  });

  it("shared connection is relevant to each mapped property", () => {
    const ids = resolveConnectionRelevantPropertyIds({
      workspacePropertyId: PROPERTY_A,
      listingMappings: [
        { propertyId: PROPERTY_A, status: "active" },
        { propertyId: PROPERTY_B, status: "paused" },
      ],
      productMappings: [],
    });
    expect(ids.sort()).toEqual([PROPERTY_A, PROPERTY_B].sort());
    expect(connectionHasPropertyBearingMappings(
      [{ propertyId: PROPERTY_A, status: "active" }],
      [],
    )).toBe(true);
    expect(collectMappedPropertyIds([], [])).toEqual([]);
  });
});

describe("ChannelConnection property authorization (AP 1.2)", () => {
  const checker = new PermissionChecker();

  it("manager cannot access unassigned property", () => {
    const manager = {
      userId: "u1",
      role: "manager" as const,
      propertyIds: [PROPERTY_A],
    };
    expect(() =>
      assertActorCanAccessChannelProperty(checker, manager, "t1", PROPERTY_B),
    ).toThrow(ForbiddenError);
  });

  it("manager can read shared connection when one property overlaps", () => {
    const manager = {
      userId: "u1",
      role: "manager" as const,
      propertyIds: [PROPERTY_A],
    };
    expect(() =>
      assertActorCanReadChannelConnection(checker, manager, "t1", [
        PROPERTY_A,
        PROPERTY_B,
      ]),
    ).not.toThrow();
  });

  it("manager cannot operate shared connection without all properties", () => {
    const manager = {
      userId: "u1",
      role: "manager" as const,
      propertyIds: [PROPERTY_A],
    };
    expect(() =>
      assertActorCanOperateChannelConnection(checker, manager, "t1", [
        PROPERTY_A,
        PROPERTY_B,
      ]),
    ).toThrow(ForbiddenError);
  });

  it("restricted actor fails closed on unmapped connection with no workspace", () => {
    const manager = {
      userId: "u1",
      role: "manager" as const,
      propertyIds: [PROPERTY_A],
    };
    expect(() =>
      assertActorCanReadChannelConnection(checker, manager, "t1", []),
    ).toThrow(ForbiddenError);
  });

  it("admin with null propertyIds can operate", () => {
    const admin = {
      userId: "u1",
      role: "admin" as const,
      propertyIds: null,
    };
    expect(() =>
      assertActorCanOperateChannelConnection(checker, admin, "t1", [
        PROPERTY_A,
        PROPERTY_B,
      ]),
    ).not.toThrow();
  });
});
