import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";

describe("S4a-1 operator API fitness (web)", () => {
  it("feature gate defaults off", () => {
    expect(isChannelOperatorApiEnabled({})).toBe(false);
    expect(isChannelOperatorApiEnabled({ CHANNELS_OPERATOR_API_ENABLED: "TRUE" })).toBe(
      false,
    );
    expect(isChannelOperatorApiEnabled({ CHANNELS_OPERATOR_API_ENABLED: "true" })).toBe(
      true,
    );
  });

  it("container wires S4a-2a transport DI and S4a-2b surfaces may reference webhook flag helpers outside container", () => {
    const container = join(process.cwd(), "lib", "di", "container.ts");
    expect(existsSync(container)).toBe(true);
    const source = readFileSync(container, "utf8");
    expect(source).toMatch(/CreateChannelConnectionUseCase/);
    expect(source).toMatch(/PrismaChannelCredentialVault/);
    expect(source).toMatch(/HandleChannelWebhookTransportUseCase/);
    expect(source).toMatch(/ExecuteChannelPollConnectionUseCase/);
    expect(source).toMatch(/PollChannelConnectionJobHandler/);
    expect(source).toMatch(/PollingFeatureGatedPollJobHandler/);
    expect(source).toMatch(/EnqueueChannelConnectionPollUseCase/);
  });

  it("production DI forbids deterministic master-key fallback", () => {
    const container = join(process.cwd(), "lib", "di", "container.ts");
    const source = readFileSync(container, "utf8");
    expect(source).not.toMatch(/Buffer\.alloc\s*\(\s*32\s*,\s*7\s*\)/);
    expect(source).not.toMatch(/resolveChannelsCredentialsMasterKey/);
    expect(source).not.toMatch(/Buffer\.alloc\s*\(\s*32/);
    expect(source).toMatch(/new PrismaChannelCredentialVault\s*\(\s*\)/);
  });
});
