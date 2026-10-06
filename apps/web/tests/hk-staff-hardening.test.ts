import { describe, expect, it } from "vitest";
import { resolveHkStaffCapabilitySecret } from "@/lib/housekeeping/hk-staff-secret";
import { hkStaffCookieOptions } from "@/lib/housekeeping/hk-staff-cookie";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("hk_staff capability secret resolution", () => {
  it("prefers dedicated HK_STAFF_CAPABILITY_SECRET", () => {
    const secret = resolveHkStaffCapabilitySecret({
      HK_STAFF_CAPABILITY_SECRET: "dedicated-secret-16+",
      AUTH_SECRET: "auth-secret-should-not-win",
      NODE_ENV: "production",
    });
    expect(secret).toBe("dedicated-secret-16+");
  });

  it("fails closed in production when dedicated secret missing", () => {
    expect(() =>
      resolveHkStaffCapabilitySecret({
        NODE_ENV: "production",
        AUTH_SECRET: "even-if-auth-secret-is-long-enough",
      }),
    ).toThrow(/HK_STAFF_CAPABILITY_SECRET is required in production/);
  });

  it("allows AUTH_SECRET only outside production", () => {
    const secret = resolveHkStaffCapabilitySecret({
      NODE_ENV: "development",
      AUTH_SECRET: "auth-secret-long-enough",
    });
    expect(secret).toBe("hk_staff:auth-secret-long-enough");
  });

  it("allows explicit test/dev fallback only when opted in", () => {
    expect(
      resolveHkStaffCapabilitySecret({
        NODE_ENV: "test",
      }),
    ).toBe("hk_staff_dev_secret_do_not_use_in_prod");

    expect(() =>
      resolveHkStaffCapabilitySecret({
        NODE_ENV: "development",
      }),
    ).toThrow(/required/);
  });
});

describe("hk_staff cookie options", () => {
  it("sets HttpOnly, SameSite=Lax, Secure in production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const opts = hkStaffCookieOptions(1800);
      expect(opts.httpOnly).toBe(true);
      expect(opts.sameSite).toBe("lax");
      expect(opts.secure).toBe(true);
      expect(opts.path).toBe("/");
      expect(opts.maxAge).toBe(1800);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("public QR vs authenticated checklist separation", () => {
  const root = join(__dirname, "..");

  it("keeps physical QR at /q/{token} and checklist at /clean behind Auth.js", () => {
    const middleware = readFileSync(join(root, "middleware.ts"), "utf8");
    expect(middleware).toContain("isPublicQrStaffPath");
    expect(middleware).toContain("NOT /q/{token}/clean");
    expect(middleware).toContain("[0-9a-f]{64}");
    expect(middleware).toContain("/staff");

    expect(existsSync(join(root, "app/q/[token]/clean/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app/q/[token]/staff/page.tsx"))).toBe(true);

    const publicPage = readFileSync(join(root, "app/q/[token]/page.tsx"), "utf8");
    expect(publicPage).toContain("resolvePublicQrRouteUseCase");
    expect(publicPage).not.toContain("QrLandingPage");
    expect(publicPage).not.toContain("CleaningForm");

    const cleanPage = readFileSync(
      join(root, "app/q/[token]/clean/page.tsx"),
      "utf8",
    );
    expect(cleanPage).toContain("QrLandingPage");
    expect(cleanPage).toContain("Auth.js");
  });

  it("staff unlock sets capability cookie and never returns PIN", () => {
    const unlock = readFileSync(
      join(root, "app/api/public/v1/housekeeping/staff/unlock/route.ts"),
      "utf8",
    );
    expect(unlock).toContain("HK_STAFF_COOKIE_NAME");
    expect(unlock).toContain("hkStaffCookieOptions");
    expect(unlock).not.toMatch(/pinHash|passwordHash/);
    expect(unlock).not.toContain("requireTenantContext");
  });

  it("wires HMAC signer via server-only web module, not domain barrel", () => {
    const container = readFileSync(join(root, "lib/di/container.ts"), "utf8");
    const signerWrap = readFileSync(
      join(root, "lib/housekeeping/hmac-hk-staff-capability-signer.ts"),
      "utf8",
    );
    const secret = readFileSync(
      join(root, "lib/housekeeping/hk-staff-secret.ts"),
      "utf8",
    );
    const cookie = readFileSync(
      join(root, "lib/housekeeping/hk-staff-cookie.ts"),
      "utf8",
    );

    expect(container).toContain(
      'from "@/lib/housekeeping/hmac-hk-staff-capability-signer"',
    );
    expect(container).not.toMatch(
      /HmacHkStaffCapabilitySigner[^]*from ["']@hcp\/domain["']/,
    );
    expect(signerWrap).toContain('import "server-only"');
    expect(signerWrap).toContain('@hcp/domain/hk-staff-signer');
    expect(secret).toContain('import "server-only"');
    expect(cookie).toContain('import "server-only"');
  });
});
