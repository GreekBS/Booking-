import { describe, expect, it } from "vitest";
import { RoomType, Unit, ValidationError } from "../../src/index";

const ids = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  propertyId: "33333333-3333-4333-8333-333333333333",
};

describe("RoomType C1 domain foundation", () => {
  it("creates an active commercial category with occupancy defaults", () => {
    const rt = RoomType.create({
      ...ids,
      name: "  Deluxe Double Room  ",
      code: " DLX ",
      maxGuests: 2,
      maxAdults: 2,
      maxChildren: 0,
    });

    expect(rt.name).toBe("Deluxe Double Room");
    expect(rt.code).toBe("DLX");
    expect(rt.status).toBe("active");
    expect(rt.isActive).toBe(true);
    expect(rt.deletedAt).toBeNull();
    expect(rt.sortOrder).toBe(0);
  });

  it("rejects blank names and occupancy overflows", () => {
    expect(() =>
      RoomType.create({ ...ids, name: "   ", maxGuests: 2 }),
    ).toThrow(ValidationError);

    expect(() =>
      RoomType.create({
        ...ids,
        name: "Suite",
        maxGuests: 2,
        maxAdults: 2,
        maxChildren: 1,
      }),
    ).toThrow(/maxAdults \+ maxChildren/);
  });

  it("soft-deletes by setting deletedAt and inactive status", () => {
    const rt = RoomType.create({ ...ids, name: "Standard", maxGuests: 2 });
    rt.softDelete();
    expect(rt.deletedAt).not.toBeNull();
    expect(rt.status).toBe("inactive");
    expect(rt.isActive).toBe(false);
  });
});

describe("Unit C1 hotel metadata compatibility", () => {
  it("defaults hotel metadata to null for existing create paths", () => {
    const unit = Unit.create({
      id: "44444444-4444-4444-8444-444444444444",
      tenantId: ids.tenantId,
      propertyId: ids.propertyId,
      name: "Entire Property",
      slug: "entire-property",
      maxGuests: 4,
    });

    expect(unit.roomTypeId).toBeNull();
    expect(unit.roomNumber).toBeNull();
    expect(unit.floor).toBeNull();
    expect(unit.status).toBe("active");
  });

  it("reconstitutes pre-C1 props without hotel fields", () => {
    const unit = Unit.reconstitute({
      id: "55555555-5555-4555-8555-555555555555",
      tenantId: ids.tenantId,
      propertyId: ids.propertyId,
      name: "Villa Unit",
      slug: "villa-unit",
      maxGuests: 6,
      bedrooms: 3,
      bathrooms: 2,
      status: "active",
      deletedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(unit.roomTypeId).toBeNull();
    expect(unit.roomNumber).toBeNull();
    expect(unit.floor).toBeNull();
  });

  it("stores optional room number and floor when provided", () => {
    const unit = Unit.create({
      id: "66666666-6666-4666-8666-666666666666",
      tenantId: ids.tenantId,
      propertyId: ids.propertyId,
      name: "Room 204",
      slug: "room-204",
      maxGuests: 2,
      roomTypeId: ids.id,
      roomNumber: " 204 ",
      floor: " 2 ",
    });

    expect(unit.roomTypeId).toBe(ids.id);
    expect(unit.roomNumber).toBe("204");
    expect(unit.floor).toBe("2");
  });
});
