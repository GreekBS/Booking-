import type { IStorefrontClient } from "./IStorefrontClient.js";
import type { StorefrontClientConfig } from "../types/index.js";
import { createMockStorefrontClient } from "./MockStorefrontClient.js";
import { HttpStorefrontClient } from "./HttpStorefrontClient.js";

export function createStorefrontClient(config: StorefrontClientConfig): IStorefrontClient {
  if (config.mock === true || (config.mock !== false && !config.baseUrl)) {
    return createMockStorefrontClient(config);
  }

  return new HttpStorefrontClient(config);
}

export { HttpStorefrontClient } from "./HttpStorefrontClient.js";
