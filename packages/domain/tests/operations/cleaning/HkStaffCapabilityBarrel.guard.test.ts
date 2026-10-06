import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as Domain from "../../../src/index";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("hk_staff domain public barrel stays free of node:crypto", () => {
  it("does not export the concrete HMAC signer from @hcp/domain", () => {
    expect(Domain).not.toHaveProperty("HmacHkStaffCapabilitySigner");
    expect(Domain).toHaveProperty("HK_STAFF_CAPABILITY_TYP");
    expect(Domain).toHaveProperty("HK_STAFF_CAPABILITY_TTL_SECONDS");
    expect(Domain).toHaveProperty("HK_STAFF_COOKIE_NAME");
  });

  it("types module and cleaning barrel do not import node:crypto", () => {
    const typesPath = join(
      root,
      "src/operations/cleaning/domain/HkStaffCapability.ts",
    );
    const cleaningIndex = join(root, "src/operations/cleaning/index.ts");
    const signerPath = join(
      root,
      "src/operations/cleaning/domain/HmacHkStaffCapabilitySigner.ts",
    );

    expect(existsSync(typesPath)).toBe(true);
    expect(existsSync(signerPath)).toBe(true);

    const typesSrc = readFileSync(typesPath, "utf8");
    const indexSrc = readFileSync(cleaningIndex, "utf8");
    const signerSrc = readFileSync(signerPath, "utf8");

    expect(typesSrc).not.toMatch(/node:crypto/);
    expect(typesSrc).not.toMatch(/createHmac|timingSafeEqual/);
    expect(indexSrc).not.toMatch(/HmacHkStaffCapabilitySigner/);
    expect(indexSrc).toContain('export * from "./domain/HkStaffCapability"');
    expect(signerSrc).toMatch(/from ["']node:crypto["']/);
  });
});
