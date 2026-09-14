import { describe, it, expect, vi } from "vitest";
import type { DomainEvent, IOutboxRepository } from "../../../src/shared/ports/InfrastructurePorts";
import type {
  OutboxEntry,
  OutboxEventStatus,
  OutboxFailureDisposition,
} from "../../../src/shared/types/index";
import { LoggingHandler } from "../../../src/platform/async/handlers/LoggingHandler";
import { OutboxHandlerRegistry } from "../../../src/platform/async/handlers/OutboxHandlerRegistry";
import { ProcessOutboxBatchUseCase } from "../../../src/platform/async/application/ProcessOutboxBatchUseCase";

function makeEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: "event-1",
    tenantId: "tenant-1",
    aggregateType: "Hold",
    aggregateId: "hold-1",
    eventType: "HoldCreated",
    payload: { unitId: "unit-1" },
    status: "processing",
    attemptCount: 0,
    ...overrides,
  };
}

class FakeOutboxRepository implements IOutboxRepository {
  private readonly entries = new Map<string, OutboxEntry>();

  seed(entry: OutboxEntry): void {
    this.entries.set(entry.id, { ...entry });
  }

  async saveEvents(_events: DomainEvent[]): Promise<void> {}

  async findUnprocessed(_limit: number): Promise<OutboxEntry[]> {
    return [...this.entries.values()].filter((entry) => entry.status === "pending");
  }

  async claimBatch(limit: number): Promise<OutboxEntry[]> {
    const pending = [...this.entries.values()]
      .filter((entry) => entry.status === "pending")
      .slice(0, limit)
      .map((entry) => ({ ...entry, status: "processing" as OutboxEventStatus }));

    for (const entry of pending) {
      this.entries.set(entry.id, entry);
    }

    return pending;
  }

  async markProcessed(ids: string[]): Promise<void> {
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) {
        this.entries.set(id, { ...entry, status: "completed" });
      }
    }
  }

  async markCompleted(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.set(id, { ...entry, status: "completed" });
    }
  }

  async markFailed(
    id: string,
    _error: string,
    maxAttempts: number,
  ): Promise<OutboxFailureDisposition> {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`Missing entry ${id}`);
    }

    const attemptCount = entry.attemptCount + 1;
    if (attemptCount >= maxAttempts) {
      this.entries.set(id, { ...entry, status: "dead_letter", attemptCount });
      return "dead_letter";
    }

    this.entries.set(id, { ...entry, status: "pending", attemptCount });
    return "retry";
  }

  getStatus(id: string): OutboxEventStatus | undefined {
    return this.entries.get(id)?.status;
  }
}

describe("LoggingHandler", () => {
  it("logs every event type", async () => {
    const log = vi.fn();
    const handler = new LoggingHandler(log);
    const entry = makeEntry();

    expect(handler.canHandle("HoldCreated")).toBe(true);
    await handler.handle(entry);

    expect(log).toHaveBeenCalledWith(entry);
  });
});

describe("ProcessOutboxBatchUseCase", () => {
  it("claims events, runs handler, and marks them completed", async () => {
    const repository = new FakeOutboxRepository();
    repository.seed(makeEntry({ id: "event-1", status: "pending" }));

    const log = vi.fn();
    const registry = new OutboxHandlerRegistry();
    registry.register(new LoggingHandler(log));

    const useCase = new ProcessOutboxBatchUseCase(repository, registry);
    const result = await useCase.execute(10);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({
      claimed: 1,
      completed: 1,
      retried: 0,
      deadLettered: 0,
    });
    expect(log).toHaveBeenCalledOnce();
    expect(repository.getStatus("event-1")).toBe("completed");
  });

  it("retries handler failures until dead-letter threshold", async () => {
    const repository = new FakeOutboxRepository();
    repository.seed(makeEntry({ id: "event-1", status: "pending" }));

    const registry = new OutboxHandlerRegistry();
    registry.register({
      canHandle: () => true,
      handle: async () => {
        throw new Error("handler failed");
      },
    });

    const useCase = new ProcessOutboxBatchUseCase(repository, registry, {
      maxAttempts: 2,
    });

    const firstPass = await useCase.execute(1);
    expect(firstPass.getValue()).toMatchObject({
      claimed: 1,
      completed: 0,
      retried: 1,
      deadLettered: 0,
    });
    expect(repository.getStatus("event-1")).toBe("pending");

    const secondPass = await useCase.execute(1);
    expect(secondPass.getValue()).toMatchObject({
      claimed: 1,
      completed: 0,
      retried: 0,
      deadLettered: 1,
    });
    expect(repository.getStatus("event-1")).toBe("dead_letter");
  });
});
