import { describe, it, expect } from "vitest";
import { Property } from "./catalog/domain/Property";
import { Tenant } from "./platform/domain/Tenant";

describe("Tenant aggregate", () => {
  it("creates tenant and emits event", () => {
    const tenant = Tenant.create({
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Acme Rentals",
      slug: "acme-rentals",
    });

    expect(tenant.name).toBe("Acme Rentals");
    expect(tenant.isActive).toBe(true);

    const events = tenant.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("TenantCreated");
  });

  it("suspends tenant", () => {
    const tenant = Tenant.create({
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Test",
      slug: "test-org",
    });

    tenant.suspend("payment");
    expect(tenant.status).toBe("suspended");
  });
});

describe("Property aggregate", () => {
  it("creates property with default unit", () => {
    const property = Property.create({
      id: "550e8400-e29b-41d4-a716-446655440010",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Villa Sunset",
      slug: "villa-sunset",
      defaultUnit: {
        id: "550e8400-e29b-41d4-a716-446655440012",
        maxGuests: 4,
      },
    });

    expect(property.units).toHaveLength(1);
    expect(property.units[0]?.name).toBe("Entire Property");
    expect(property.units[0]?.status).toBe("active");
    expect(property.status).toBe("draft");

    const events = property.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("PropertyCreated");
  });

  it("creates hotel with inactive Entire Property placeholder (C3-H1)", () => {
    const property = Property.create({
      id: "550e8400-e29b-41d4-a716-446655440020",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      name: "City Hotel",
      slug: "city-hotel",
      type: "hotel",
      defaultUnit: {
        id: "550e8400-e29b-41d4-a716-446655440021",
        maxGuests: 2,
      },
    });

    expect(property.type).toBe("hotel");
    expect(property.units).toHaveLength(1);
    expect(property.units[0]?.name).toBe("Entire Property");
    expect(property.units[0]?.slug).toBe("entire-property");
    expect(property.units[0]?.status).toBe("inactive");
    expect(() => property.removeUnit(property.units[0]!.id)).toThrow(
      "Property must have at least one unit",
    );
  });

  it("creates apartment with active default unit", () => {
    const property = Property.create({
      id: "550e8400-e29b-41d4-a716-446655440022",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      name: "City Apt",
      slug: "city-apt",
      type: "apartment",
      defaultUnit: {
        id: "550e8400-e29b-41d4-a716-446655440023",
        maxGuests: 3,
      },
    });

    expect(property.type).toBe("apartment");
    expect(property.units[0]?.status).toBe("active");
  });

  it("prevents removing last unit", () => {
    const property = Property.create({
      id: "550e8400-e29b-41d4-a716-446655440011",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Villa",
      slug: "villa",
      defaultUnit: {
        id: "550e8400-e29b-41d4-a716-446655440013",
        maxGuests: 4,
      },
    });

    expect(() => property.removeUnit(property.units[0]!.id)).toThrow(
      "Property must have at least one unit",
    );
  });
});
