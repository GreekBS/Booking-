import { randomUUID } from "node:crypto";
import {
  CredentialReference,
  WebhookVerificationReference,
  ValidationError,
  NotFoundError,
  type IChannelCredentialStore,
  type ChannelSecretKind,
  type IChannelCredentialResolver,
  type ResolvedChannelCredentials,
  type ResolvedWebhookSecret,
} from "@hcp/domain";
import type { PrismaClient } from "@prisma/client";
import {
  prisma,
  setTenantContext,
  type PrismaTransactionClient,
} from "../../client";
import {
  parseChannelsCredentialsMasterKey,
  sealUtf8Payload,
  unsealUtf8Payload,
} from "./channelCredentialCrypto";

type DbClient = PrismaClient | PrismaTransactionClient;

function encodeSecretRef(tenantId: string, secretId: string): string {
  return `${tenantId}/${secretId}`;
}

function decodeSecretRef(encoded: string): { tenantId: string; secretId: string } {
  const idx = encoded.indexOf("/");
  if (idx <= 0 || idx === encoded.length - 1) {
    throw new ValidationError("Invalid channel secret reference encoding");
  }
  return {
    tenantId: encoded.slice(0, idx),
    secretId: encoded.slice(idx + 1),
  };
}

/**
 * Production sealed credential vault (CM-4b S4a-1).
 * Implements store + resolver against channel_secret_records.
 * Opaque refs are encoded as `{tenantId}/{secretId}` for RLS-safe resolution.
 *
 * Master key is parsed lazily on first seal/unseal so Next.js can load route
 * modules without CHANNELS_CREDENTIALS_MASTER_KEY. Credential operations fail
 * closed when the key is missing or invalid — no placeholder key is used.
 */
export class PrismaChannelCredentialVault
  implements IChannelCredentialStore, IChannelCredentialResolver
{
  private masterKey: Buffer | undefined;
  private readonly masterKeyRaw: string | undefined;

  constructor(
    private readonly client: DbClient = prisma,
    masterKeyRaw: string | undefined = process.env.CHANNELS_CREDENTIALS_MASTER_KEY,
  ) {
    this.masterKeyRaw = masterKeyRaw;
  }

  private getMasterKey(): Buffer {
    if (this.masterKey === undefined) {
      this.masterKey = parseChannelsCredentialsMasterKey(this.masterKeyRaw);
    }
    return this.masterKey;
  }

  async putCredential(
    tenantId: string,
    material: Record<string, string>,
  ): Promise<CredentialReference> {
    const secretId = randomUUID();
    const sealed = sealUtf8Payload(this.getMasterKey(), JSON.stringify(material));
    await this.insert(tenantId, secretId, "credential", sealed.ciphertext, sealed.keyVersion);
    return CredentialReference.create(encodeSecretRef(tenantId, secretId));
  }

  async putWebhookVerification(
    tenantId: string,
    secret: string,
  ): Promise<WebhookVerificationReference> {
    const secretId = randomUUID();
    const sealed = sealUtf8Payload(this.getMasterKey(), JSON.stringify({ secret }));
    await this.insert(
      tenantId,
      secretId,
      "webhook_verification",
      sealed.ciphertext,
      sealed.keyVersion,
    );
    return WebhookVerificationReference.create(encodeSecretRef(tenantId, secretId));
  }

  async deleteSecret(
    tenantId: string,
    secretId: string,
    kind: ChannelSecretKind,
  ): Promise<void> {
    const id = secretId.includes("/") ? decodeSecretRef(secretId).secretId : secretId;
    await this.withTenant(tenantId, async (tx) => {
      await tx.channelSecretRecord.updateMany({
        where: { tenantId, id, kind, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });
  }

  async resolveCredential(reference: CredentialReference): Promise<ResolvedChannelCredentials> {
    const plaintext = await this.loadPlaintext(reference.value, "credential");
    return { material: JSON.parse(plaintext) as Record<string, string> };
  }

  async resolveWebhookVerification(
    reference: WebhookVerificationReference,
  ): Promise<ResolvedWebhookSecret> {
    const plaintext = await this.loadPlaintext(reference.value, "webhook_verification");
    const parsed = JSON.parse(plaintext) as { secret: string };
    if (typeof parsed.secret !== "string") {
      throw new ValidationError("Corrupt webhook verification secret");
    }
    return { secret: parsed.secret };
  }

  private async insert(
    tenantId: string,
    secretId: string,
    kind: ChannelSecretKind,
    ciphertext: Buffer,
    keyVersion: number,
  ): Promise<void> {
    await this.withTenant(tenantId, async (tx) => {
      await tx.channelSecretRecord.create({
        data: {
          tenantId,
          id: secretId,
          kind,
          ciphertext: new Uint8Array(ciphertext),
          keyVersion,
          createdAt: new Date(),
          deletedAt: null,
        },
      });
    });
  }

  private async loadPlaintext(
    encodedRef: string,
    kind: ChannelSecretKind,
  ): Promise<string> {
    const { tenantId, secretId } = decodeSecretRef(encodedRef);
    return this.withTenant(tenantId, async (tx) => {
      const record = await tx.channelSecretRecord.findFirst({
        where: { tenantId, id: secretId, kind, deletedAt: null },
      });
      if (!record) {
        throw new NotFoundError("ChannelSecretRecord", secretId);
      }
      return unsealUtf8Payload(this.getMasterKey(), Buffer.from(record.ciphertext));
    });
  }

  private async withTenant<T>(
    tenantId: string,
    work: (tx: PrismaTransactionClient) => Promise<T>,
  ): Promise<T> {
    if ("$transaction" in this.client) {
      return this.client.$transaction(async (tx) => {
        await setTenantContext(tx, tenantId);
        return work(tx);
      });
    }
    await setTenantContext(this.client, tenantId);
    return work(this.client);
  }
}
