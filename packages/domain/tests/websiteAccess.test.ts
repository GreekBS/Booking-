import { describe, expect, it } from "vitest";
import { PermissionChecker, type ActorContext } from "../src/shared/services/PermissionChecker";
import {
  canDeleteWebsiteMediaOnProperty,
  canEditWebsiteOnProperty,
  canPublishWebsiteOnProperty,
  canReadWebsiteOnProperty,
  canUploadWebsiteMediaOnProperty,
  resolveWebsiteListScope,
} from "../src/website/application/websiteAccess";

const checker = new PermissionChecker();
const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP_A = "22222222-2222-4222-8222-222222222222";
const PROP_B = "33333333-3333-4333-8333-333333333333";

function admin(): ActorContext {
  return { userId: "u-admin", role: "admin", propertyIds: null };
}

function manager(propertyIds: string[]): ActorContext {
  return { userId: "u-mgr", role: "manager", propertyIds };
}

describe("websiteAccess", () => {
  it("allows tenant admin to read/edit/publish any property", () => {
    const actor = admin();
    expect(canReadWebsiteOnProperty(checker, actor, TENANT, PROP_A)).toBe(true);
    expect(canEditWebsiteOnProperty(checker, actor, TENANT, PROP_B)).toBe(true);
    expect(canPublishWebsiteOnProperty(checker, actor, TENANT, PROP_A)).toBe(true);
    expect(canUploadWebsiteMediaOnProperty(checker, actor, TENANT, PROP_A)).toBe(true);
    expect(canDeleteWebsiteMediaOnProperty(checker, actor, TENANT, PROP_A)).toBe(true);
  });

  it("allows manager only on assigned properties", () => {
    const actor = manager([PROP_A]);
    expect(canReadWebsiteOnProperty(checker, actor, TENANT, PROP_A)).toBe(true);
    expect(canEditWebsiteOnProperty(checker, actor, TENANT, PROP_A)).toBe(true);
    expect(canPublishWebsiteOnProperty(checker, actor, TENANT, PROP_A)).toBe(true);
    expect(canUploadWebsiteMediaOnProperty(checker, actor, TENANT, PROP_A)).toBe(true);

    expect(canReadWebsiteOnProperty(checker, actor, TENANT, PROP_B)).toBe(false);
    expect(canEditWebsiteOnProperty(checker, actor, TENANT, PROP_B)).toBe(false);
    expect(canPublishWebsiteOnProperty(checker, actor, TENANT, PROP_B)).toBe(false);
    expect(canUploadWebsiteMediaOnProperty(checker, actor, TENANT, PROP_B)).toBe(false);
  });

  it("denies media delete to managers (tenant-only)", () => {
    const actor = manager([PROP_A]);
    expect(canDeleteWebsiteMediaOnProperty(checker, actor, TENANT, PROP_A)).toBe(false);
  });

  it("resolves list scope for admin and manager", () => {
    expect(
      resolveWebsiteListScope(checker, admin(), TENANT, { entireTenant: true }),
    ).toEqual({ propertyId: null, allowedPropertyIds: null });

    expect(
      resolveWebsiteListScope(checker, admin(), TENANT, { propertyId: PROP_A }),
    ).toEqual({ propertyId: PROP_A, allowedPropertyIds: null });

    expect(
      resolveWebsiteListScope(checker, manager([PROP_A]), TENANT, {
        propertyId: PROP_A,
      }),
    ).toEqual({ propertyId: PROP_A, allowedPropertyIds: [PROP_A] });

    expect(
      resolveWebsiteListScope(checker, manager([PROP_A]), TENANT, {
        propertyId: PROP_B,
      }),
    ).toBe("forbidden");

    expect(
      resolveWebsiteListScope(checker, manager([PROP_A]), TENANT, {}),
    ).toBe("forbidden");
  });
});
