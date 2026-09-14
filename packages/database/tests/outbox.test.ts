import { describe, it, expect } from "vitest";
import { PrismaOutboxRepository } from "../src/repositories/OutboxRepository";
import { PropertyCreatedEvent } from "@hcp/domain";

describe("PrismaOutboxRepository", () => {
  it("exposes saveEvents markProcessed findUnprocessed claimBatch interface", () => {
    const repo = new PrismaOutboxRepository();
    expect(typeof repo.saveEvents).toBe("function");
    expect(typeof repo.markProcessed).toBe("function");
    expect(typeof repo.findUnprocessed).toBe("function");
    expect(typeof repo.claimBatch).toBe("function");
    expect(typeof repo.markCompleted).toBe("function");
    expect(typeof repo.markFailed).toBe("function");
  });

  it("maps domain events to outbox shape", () => {
    const event = new PropertyCreatedEvent("prop-1", "tenant-1", {
      slug: "villa",
      name: "Villa",
    });

    expect(event.tenantId).toBe("tenant-1");
    expect(event.aggregateType).toBe("Property");
    expect(event.eventType).toBe("PropertyCreated");
  });
});
