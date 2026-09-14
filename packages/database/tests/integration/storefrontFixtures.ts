import { randomUUID } from "node:crypto";
import type { CommerceFixture } from "./commerceFixtures";
import { hashToken, insertPublishableKey } from "../../src/repositories/storefront/PublishableKeyRepository";

export const STOREFRONT_TEST_PUBLISHABLE_KEY = "pk_test_abcdefghijklmnop1234";

export async function seedStorefrontKey(
  ids: CommerceFixture,
  options?: { allowedDomains?: string[] },
): Promise<void> {
  await insertPublishableKey({
    id: randomUUID(),
    tenantId: ids.tenantId,
    rawKey: STOREFRONT_TEST_PUBLISHABLE_KEY,
    environment: "test",
    allowedDomains: options?.allowedDomains ?? ["*"],
  });
}
