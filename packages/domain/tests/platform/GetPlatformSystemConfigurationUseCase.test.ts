import { describe, expect, it, vi } from "vitest";
import { GetPlatformSystemConfigurationUseCase } from "../../src/platform/application/GetPlatformSystemConfigurationUseCase";
import type { IPlatformAuditRepository } from "../../src/platform/ports/IPlatformAuditRepository";

describe("GetPlatformSystemConfigurationUseCase", () => {
  it("returns read-only system configuration from the port", async () => {
    const getSystemConfiguration = vi.fn().mockResolvedValue({
      environment: "development",
      nodeEnv: "test",
      vercel: false,
      platformLabel: "Talos Platform Control Center",
      superAdminCount: 2,
      tenantCount: 5,
      hasMutablePlatformSettings: false,
    });
    const audit: IPlatformAuditRepository = {
      listAuditLogs: vi.fn(),
      getSystemConfiguration,
    };
    const uc = new GetPlatformSystemConfigurationUseCase(audit);
    const result = await uc.execute();
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().hasMutablePlatformSettings).toBe(false);
    expect(result.getValue().superAdminCount).toBe(2);
  });
});
