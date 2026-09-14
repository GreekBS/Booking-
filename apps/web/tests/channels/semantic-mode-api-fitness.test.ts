import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isChannelSemanticModeApiEnabled } from "@/lib/channels/semantic-mode-api";

describe("S3f production DI / gate fitness (web)", () => {
  it("feature gate defaults off", () => {
    expect(isChannelSemanticModeApiEnabled({})).toBe(false);
    expect(isChannelSemanticModeApiEnabled({ CHANNELS_SEMANTIC_MODE_API_ENABLED: "TRUE" })).toBe(
      false,
    );
    expect(isChannelSemanticModeApiEnabled({ CHANNELS_SEMANTIC_MODE_API_ENABLED: "true" })).toBe(
      true,
    );
  });

  it("container wires one Prisma semantic mutation path and route imports use cases only", () => {
    const container = join(process.cwd(), "lib", "di", "container.ts");
    const route = join(
      process.cwd(),
      "app",
      "api",
      "admin",
      "v1",
      "channel-connections",
      "[connectionId]",
      "semantic-mode",
      "route.ts",
    );
    expect(existsSync(container)).toBe(true);
    expect(existsSync(route)).toBe(true);

    const containerSource = readFileSync(container, "utf8");
    expect(
      (containerSource.match(/new PrismaChannelSemanticModeTransitionStore/g) ?? []).length,
    ).toBe(1);
    expect(
      (containerSource.match(/new SetChannelConnectionSemanticModeUseCase/g) ?? []).length,
    ).toBe(1);
    expect(containerSource).toMatch(/GetChannelConnectionSemanticConfigurationUseCase/);
    // S4a-1 wires Activate/Resume; S3f path remains independent.

    const routeSource = readFileSync(route, "utf8");
    expect(routeSource).toMatch(/setChannelConnectionSemanticModeUseCase/);
    expect(routeSource).toMatch(/getChannelConnectionSemanticConfigurationUseCase/);
    expect(routeSource).not.toMatch(/PrismaChannelSemanticModeTransitionStore/);
    expect(routeSource).not.toMatch(/IChannelSemanticModeTransitionStore/);
    expect(routeSource).not.toMatch(/persistSemanticState/);
    expect(routeSource).not.toMatch(/ActivateChannelConnectionUseCase/);
    expect(routeSource).not.toMatch(/ResumeChannelConnectionUseCase/);
  });
});
