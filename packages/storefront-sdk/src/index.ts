export { STOREFRONT_API_VERSION } from "./types/index.js";
export type * from "./types/index.js";
export * from "./types/theme.js";
export * from "./types/widgetEvents.js";
export * from "./errors/StorefrontError.js";
export * from "./validation/schemas.js";
export type { IStorefrontClient } from "./client/IStorefrontClient.js";
export { MockStorefrontClient, createMockStorefrontClient } from "./client/MockStorefrontClient.js";
export { HttpStorefrontClient } from "./client/HttpStorefrontClient.js";
export { createStorefrontClient } from "./client/createStorefrontClient.js";
export {
  MOCK_PUBLISHABLE_KEY,
  mockProperty,
  mockUnit,
  mockStorefrontConfig,
  mockWidgetConfig,
} from "./mock/fixtures.js";
