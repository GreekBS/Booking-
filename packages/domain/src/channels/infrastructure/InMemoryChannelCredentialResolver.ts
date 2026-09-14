import type { CredentialReference } from "../domain/value-objects/CredentialReference";
import type { WebhookVerificationReference } from "../domain/value-objects/WebhookVerificationReference";
import type {
  IChannelCredentialResolver,
  ResolvedChannelCredentials,
  ResolvedWebhookSecret,
} from "../ports/IChannelCredentialResolver";

export class InMemoryChannelCredentialResolver implements IChannelCredentialResolver {
  private readonly credentials = new Map<string, ResolvedChannelCredentials>();
  private readonly webhookSecrets = new Map<string, ResolvedWebhookSecret>();

  seedCredential(reference: CredentialReference, material: Record<string, string>): void {
    this.credentials.set(reference.value, { material });
  }

  seedWebhookVerification(reference: WebhookVerificationReference, secret: string): void {
    this.webhookSecrets.set(reference.value, { secret });
  }

  async resolveCredential(reference: CredentialReference): Promise<ResolvedChannelCredentials> {
    const resolved = this.credentials.get(reference.value);
    if (!resolved) {
      return { material: { token: `in-memory:${reference.value}` } };
    }
    return { material: { ...resolved.material } };
  }

  async resolveWebhookVerification(
    reference: WebhookVerificationReference,
  ): Promise<ResolvedWebhookSecret> {
    const resolved = this.webhookSecrets.get(reference.value);
    if (!resolved) {
      return { secret: `in-memory:${reference.value}` };
    }
    return { secret: resolved.secret };
  }

  clear(): void {
    this.credentials.clear();
    this.webhookSecrets.clear();
  }
}
