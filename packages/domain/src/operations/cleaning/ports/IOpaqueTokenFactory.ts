/**
 * Mints and hashes opaque bearer tokens (QR codes).
 * Implementations must use a CSPRNG and a one-way hash — the plaintext token
 * is shown once at issuance and never persisted.
 */
export interface IOpaqueTokenFactory {
  create(): { token: string; tokenHash: string };
  hash(token: string): string;
}
