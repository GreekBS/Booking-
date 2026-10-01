/**
 * Authenticated encryption for recoverable housekeeping QR tokens.
 * Scan/resolve continues to use SHA-256 tokenHash — this seal is for
 * authorized display/reprint only. Implementations must fail closed when
 * the encryption key is missing or invalid (never fall back to plaintext).
 */
export interface SealedHousekeepingQrToken {
  ciphertext: Uint8Array;
  keyVersion: number;
}

export interface IHousekeepingQrTokenSealer {
  seal(token: string): SealedHousekeepingQrToken;
  unseal(ciphertext: Uint8Array, keyVersion: number): string;
}
