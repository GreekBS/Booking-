import {
  parseChannelsCredentialsMasterKey,
  sealUtf8Payload,
  unsealUtf8Payload,
} from "../../channels/channelCredentialCrypto";
import type { IHousekeepingQrTokenSealer } from "@hcp/domain";
import { PersistenceCorruptionError, ValidationError } from "@hcp/domain";

const HOUSEKEEPING_QR_KEY_ERROR =
  "Housekeeping QR encryption is not configured";

/**
 * Parse HOUSEKEEPING_QR_ENCRYPTION_KEY.
 * Same format as channel vault keys: base64 of exactly 32 random bytes.
 * Fail closed — never returns a placeholder key; never logs the raw value.
 */
export function parseHousekeepingQrEncryptionKey(
  raw: string | undefined,
): Buffer {
  try {
    return parseChannelsCredentialsMasterKey(raw);
  } catch {
    throw new PersistenceCorruptionError(HOUSEKEEPING_QR_KEY_ERROR);
  }
}

/**
 * AES-256-GCM sealer reusing the channel credential seal primitive
 * (IV 12 + tag 16 + ciphertext) with a dedicated env key.
 */
export class AesHousekeepingQrTokenSealer implements IHousekeepingQrTokenSealer {
  private masterKey: Buffer | undefined;

  constructor(
    private readonly masterKeyRaw: string | undefined = process.env
      .HOUSEKEEPING_QR_ENCRYPTION_KEY,
  ) {}

  private getMasterKey(): Buffer {
    if (this.masterKey === undefined) {
      this.masterKey = parseHousekeepingQrEncryptionKey(this.masterKeyRaw);
    }
    return this.masterKey;
  }

  seal(token: string): { ciphertext: Uint8Array; keyVersion: number } {
    const sealed = sealUtf8Payload(this.getMasterKey(), token);
    return {
      ciphertext: new Uint8Array(sealed.ciphertext),
      keyVersion: sealed.keyVersion,
    };
  }

  unseal(ciphertext: Uint8Array, _keyVersion: number): string {
    if (ciphertext.length < 28) {
      throw new ValidationError("Invalid sealed housekeeping QR payload");
    }
    try {
      return unsealUtf8Payload(this.getMasterKey(), Buffer.from(ciphertext));
    } catch (error) {
      if (
        error instanceof PersistenceCorruptionError ||
        error instanceof ValidationError
      ) {
        throw error;
      }
      throw new ValidationError("Invalid sealed housekeeping QR payload");
    }
  }
}
