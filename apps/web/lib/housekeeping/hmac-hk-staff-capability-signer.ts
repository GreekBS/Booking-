/**
 * Server-only HMAC capability signer + lazy factory for DI.
 * Secret is resolved on first issue/verify — not at module import.
 */
import "server-only";

import type {
  HkStaffCapabilityClaims,
  IHkStaffCapabilitySigner,
} from "@hcp/domain";
import { HmacHkStaffCapabilitySigner } from "@hcp/domain/hk-staff-signer";
import { resolveHkStaffCapabilitySecret } from "./hk-staff-secret";

export { HmacHkStaffCapabilitySigner };

/**
 * Returns an IHkStaffCapabilitySigner that constructs the concrete HMAC
 * signer (and therefore resolves HK_STAFF_CAPABILITY_SECRET) only when
 * issue() or verify() is first called.
 */
export function createLazyHkStaffCapabilitySigner(
  resolveSecret: () => string = () => resolveHkStaffCapabilitySecret(),
): IHkStaffCapabilitySigner {
  let inner: HmacHkStaffCapabilitySigner | null = null;

  const getInner = (): HmacHkStaffCapabilitySigner => {
    if (!inner) {
      inner = new HmacHkStaffCapabilitySigner(resolveSecret());
    }
    return inner;
  };

  return {
    issue(
      input: Omit<HkStaffCapabilityClaims, "typ" | "v" | "iat" | "exp"> & {
        now?: Date;
        ttlSeconds?: number;
      },
    ) {
      return getInner().issue(input);
    },
    verify(token: string, now?: Date) {
      return getInner().verify(token, now);
    },
  };
}
