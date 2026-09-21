import { describe, expect, it, vi } from "vitest";
import { ListPlatformAuditLogsUseCase } from "../../src/platform/application/ListPlatformAuditLogsUseCase";
import type {
  IPlatformAuditRepository,
  PlatformAuditLogRow,
} from "../../src/platform/ports/IPlatformAuditRepository";

function row(overrides: Partial<PlatformAuditLogRow> = {}): PlatformAuditLogRow {
  return {
    id: "a1",
    createdAt: new Date("2026-01-15T12:00:00.000Z"),
    action: "tenant.suspend",
    resourceType: "tenant",
    resourceId: "t1",
    tenantId: "t1",
    tenantName: "Acme",
    actorId: "u1",
    actorName: "Admin",
    actorEmail: "admin@example.com",
    ipAddress: null,
    metadata: {},
    ...overrides,
  };
}

describe("ListPlatformAuditLogsUseCase", () => {
  it("rejects invalid pagination", async () => {
    const audit: IPlatformAuditRepository = {
      listAuditLogs: vi.fn(),
      getSystemConfiguration: vi.fn(),
    };
    const uc = new ListPlatformAuditLogsUseCase(audit);
    const result = await uc.execute({ page: 0, limit: 50 });
    expect(result.isFailure).toBe(true);
  });

  it("passes filters and end-of-day `to` bound", async () => {
    const listAuditLogs = vi.fn().mockResolvedValue({
      data: [row()],
      total: 1,
      page: 1,
      limit: 50,
    });
    const audit: IPlatformAuditRepository = {
      listAuditLogs,
      getSystemConfiguration: vi.fn(),
    };
    const uc = new ListPlatformAuditLogsUseCase(audit);
    const result = await uc.execute({
      page: 1,
      limit: 50,
      action: "tenant",
      actorId: "u1",
      tenantId: "t1",
      from: "2026-01-01",
      to: "2026-01-31",
    });
    expect(result.isSuccess).toBe(true);
    expect(listAuditLogs).toHaveBeenCalledOnce();
    const query = listAuditLogs.mock.calls[0][0];
    expect(query.action).toBe("tenant");
    expect(query.actorId).toBe("u1");
    expect(query.tenantId).toBe("t1");
    expect(query.from).toEqual(new Date("2026-01-01"));
    expect(query.to.getHours()).toBe(23);
    expect(query.to.getMinutes()).toBe(59);
  });

  it("rejects inverted date range", async () => {
    const audit: IPlatformAuditRepository = {
      listAuditLogs: vi.fn(),
      getSystemConfiguration: vi.fn(),
    };
    const uc = new ListPlatformAuditLogsUseCase(audit);
    const result = await uc.execute({
      from: "2026-02-01",
      to: "2026-01-01",
    });
    expect(result.isFailure).toBe(true);
  });
});
