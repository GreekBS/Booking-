import { describe, expect, it } from "vitest";
import { Task } from "../../src/operations/domain/Task";
import { UnitHousekeepingStatus } from "../../src/operations/domain/UnitHousekeepingStatus";
import { TaskStateMachine } from "../../src/operations/domain/TaskStateMachine";
import { ConflictError } from "../../src/shared/errors/DomainError";
import {
  canonicalTurnoverSourceKey,
  historyTurnoverSourceKey,
} from "../../src/operations/domain/turnoverKeys";

describe("Task state machine", () => {
  it("allows OPEN → IN_PROGRESS → COMPLETED and reopen", () => {
    const task = Task.create({
      id: "t1",
      tenantId: "ten",
      propertyId: "p1",
      category: "HOUSEKEEPING",
      title: "Clean",
    });
    expect(task.version).toBe(1);
    task.start(1);
    expect(task.status).toBe("IN_PROGRESS");
    expect(task.version).toBe(2);
    task.complete(2, "done");
    expect(task.status).toBe("COMPLETED");
    task.reopen(3);
    expect(task.status).toBe("OPEN");
    expect(task.completedAt).toBeNull();
    expect(task.completionNote).toBeNull();
  });

  it("rejects CANCELLED → OPEN", () => {
    const task = Task.create({
      id: "t2",
      tenantId: "ten",
      propertyId: "p1",
      category: "GENERAL",
      title: "X",
    });
    task.cancel(1);
    expect(() => TaskStateMachine.assertCanTransition("CANCELLED", "OPEN")).toThrow(
      ConflictError,
    );
  });

  it("CAS rejects stale version on start", () => {
    const task = Task.create({
      id: "t3",
      tenantId: "ten",
      propertyId: "p1",
      category: "GENERAL",
      title: "X",
    });
    expect(() => task.start(99)).toThrow(ConflictError);
  });
});

describe("Unit housekeeping", () => {
  it("CLEAN ↔ DIRTY with version bumps", () => {
    const hk = UnitHousekeepingStatus.create({
      tenantId: "ten",
      propertyId: "p1",
      unitId: "u1",
    });
    expect(hk.status).toBe("CLEAN");
    expect(hk.markDirty(1, "MANUAL", "user")).toBe(true);
    expect(hk.status).toBe("DIRTY");
    expect(hk.version).toBe(2);
    expect(hk.markDirty(2, "MANUAL", "user")).toBe(false);
    expect(hk.markClean(2, "MANUAL", "user")).toBe(true);
    expect(hk.status).toBe("CLEAN");
  });
});

describe("turnover keys", () => {
  it("uses stable booking identity", () => {
    expect(canonicalTurnoverSourceKey("b1")).toBe("turnover:b1");
    expect(historyTurnoverSourceKey("b1", "t9")).toBe("turnover:b1:history:t9");
  });
});
