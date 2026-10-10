import { describe, expect, it } from "vitest";
import {
  MAX_BULK_CREATE_UNITS,
  planBulkPhysicalUnits,
  ValidationError,
} from "../../src/index";

describe("roomInventoryPlanning C3", () => {
  it("plans sequential rooms 101-120", () => {
    const result = planBulkPhysicalUnits({
      roomTypeId: "11111111-1111-4111-8111-111111111111",
      roomTypeName: "Standard Double",
      maxGuests: 2,
      numbering: { mode: "sequential", start: 101, count: 20 },
    });
    expect(result.isSuccess).toBe(true);
    const planned = result.getValue();
    expect(planned).toHaveLength(20);
    expect(planned[0]!.roomNumber).toBe("101");
    expect(planned[19]!.roomNumber).toBe("120");
    expect(planned[0]!.name).toBe("Standard Double 101");
    expect(planned.every((p) => p.slug.startsWith("room-"))).toBe(true);
  });

  it("rejects duplicate room numbers in the request", () => {
    const result = planBulkPhysicalUnits({
      roomTypeId: "11111111-1111-4111-8111-111111111111",
      roomTypeName: "Deluxe",
      maxGuests: 2,
      numbering: {
        mode: "explicit",
        roomNumbers: ["201", "202", "201"],
      },
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ValidationError);
  });

  it("rejects conflicts with existing inventory", () => {
    const result = planBulkPhysicalUnits({
      roomTypeId: "11111111-1111-4111-8111-111111111111",
      roomTypeName: "Deluxe",
      maxGuests: 2,
      numbering: { mode: "explicit", roomNumbers: ["204"] },
      existingRoomNumbers: ["204"],
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toMatch(/already exists/i);
  });

  it("enforces the max batch size", () => {
    const result = planBulkPhysicalUnits({
      roomTypeId: "11111111-1111-4111-8111-111111111111",
      roomTypeName: "Standard",
      maxGuests: 2,
      numbering: {
        mode: "sequential",
        start: 1,
        count: MAX_BULK_CREATE_UNITS + 1,
      },
    });
    expect(result.isFailure).toBe(true);
  });
});
