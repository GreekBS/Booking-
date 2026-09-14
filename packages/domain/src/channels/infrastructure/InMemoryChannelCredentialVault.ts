import { ValidationError } from "../../shared/errors/DomainError";
import { CredentialReference } from "../domain/value-objects/CredentialReference";
import { WebhookVerificationReference } from "../domain/value-objects/WebhookVerificationReference";
import type {
  IChannelCredentialStore,
  ChannelSecretKind,
} from "../ports/IChannelCredentialStore";
import type {
  IChannelCredentialResolver,
  ResolvedChannelCredentials,
  ResolvedWebhookSecret,
} from "../ports/IChannelCredentialResolver";

interface StoredRecord {
  kind: ChannelSecretKind;
  payload: string;
  deleted: boolean;
}

let nextSecretSeq = 0;

function nextSecretId(): string {
  nextSecretSeq += 1;
  return `memcred_${nextSecretSeq.toString(16)}_${Date.now().toString(16)}`;
}

/**
 * In-memory credential store + resolver for tests (CM-4b S4a-1).
 * Not for production — production sealing lives in PrismaChannelCredentialVault.
 * Intentionally free of node:crypto so @hcp/domain stays client-bundle safe.
 */
export class InMemoryChannelCredentialVault
  implements IChannelCredentialStore, IChannelCredentialResolver
{
  private readonly secrets = new Map<string, StoredRecord>();

  private key(tenantId: string, secretId: string): string {
    return `${tenantId}:${secretId}`;
  }

  async putCredential(
    tenantId: string,
    material: Record<string, string>,
  ): Promise<CredentialReference> {
    const secretId = nextSecretId();
    this.secrets.set(this.key(tenantId, secretId), {
      kind: "credential",
      payload: JSON.stringify(material),
      deleted: false,
    });
    return CredentialReference.create(secretId);
  }

  async putWebhookVerification(
    tenantId: string,
    secret: string,
  ): Promise<WebhookVerificationReference> {
    const secretId = nextSecretId();
    this.secrets.set(this.key(tenantId, secretId), {
      kind: "webhook_verification",
      payload: JSON.stringify({ secret }),
      deleted: false,
    });
    return WebhookVerificationReference.create(secretId);
  }

  async deleteSecret(
    tenantId: string,
    secretId: string,
    kind: ChannelSecretKind,
  ): Promise<void> {
    const record = this.secrets.get(this.key(tenantId, secretId));
    if (record && record.kind === kind) {
      record.deleted = true;
    }
  }

  async resolveCredential(reference: CredentialReference): Promise<ResolvedChannelCredentials> {
    const record = this.findActive(reference.value, "credential");
    if (!record) {
      throw new ValidationError("Credential secret not found");
    }
    return { material: JSON.parse(record.payload) as Record<string, string> };
  }

  async resolveWebhookVerification(
    reference: WebhookVerificationReference,
  ): Promise<ResolvedWebhookSecret> {
    const record = this.findActive(reference.value, "webhook_verification");
    if (!record) {
      throw new ValidationError("Webhook verification secret not found");
    }
    const parsed = JSON.parse(record.payload) as { secret: string };
    return { secret: parsed.secret };
  }

  private findActive(secretId: string, kind: ChannelSecretKind): StoredRecord | null {
    for (const [mapKey, record] of this.secrets) {
      if (mapKey.endsWith(`:${secretId}`) && record.kind === kind && !record.deleted) {
        return record;
      }
    }
    return null;
  }

  clear(): void {
    this.secrets.clear();
  }
}
