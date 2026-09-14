import type { CredentialReference } from "../domain/value-objects/CredentialReference";
import type { WebhookVerificationReference } from "../domain/value-objects/WebhookVerificationReference";

export interface ResolvedChannelCredentials {
  material: Record<string, string>;
}

export interface ResolvedWebhookSecret {
  secret: string;
}

export interface IChannelCredentialResolver {
  resolveCredential(reference: CredentialReference): Promise<ResolvedChannelCredentials>;
  resolveWebhookVerification(
    reference: WebhookVerificationReference,
  ): Promise<ResolvedWebhookSecret>;
}
