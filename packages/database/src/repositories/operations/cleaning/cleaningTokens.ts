import { randomBytes } from "node:crypto";
import type { IOpaqueTokenFactory } from "@hcp/domain";
import { hashToken } from "../../IdentityRepositories";

/** 32 random bytes rendered as 64 lowercase hex characters. */
export function generateOpaqueToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashToken(token) };
}

export class CryptoOpaqueTokenFactory implements IOpaqueTokenFactory {
  create(): { token: string; tokenHash: string } {
    return generateOpaqueToken();
  }

  hash(token: string): string {
    return hashToken(token);
  }
}
