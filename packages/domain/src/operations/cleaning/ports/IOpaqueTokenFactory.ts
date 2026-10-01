/**
 * Mints and hashes opaque bearer tokens (QR codes).
 * Implementations must use a CSPRNG and a one-way hash.
 * Plaintext is never persisted; authorized reprint uses IHousekeepingQrTokenSealer.
 */
export interface IOpaqueTokenFactory {
  create(): { token: string; tokenHash: string };
  hash(token: string): string;
}
