import type { CredentialReference } from "../domain/value-objects/CredentialReference";
import type { WebhookVerificationReference } from "../domain/value-objects/WebhookVerificationReference";

export type ChannelSecretKind = "credential" | "webhook_verification";

/**
 * Durable sealed secret store for channel credential / webhook verification material.
 * Material is never returned except through IChannelCredentialResolver.
 */
export interface IChannelCredentialStore {
  /**
   * Seal credential field map and return a new opaque reference.
   * Keys must be non-empty; values must be non-empty strings; total JSON size bounded.
   */
  putCredential(
    tenantId: string,
    material: Record<string, string>,
  ): Promise<CredentialReference>;

  /**
   * Seal a webhook verification secret and return a new opaque reference.
   */
  putWebhookVerification(tenantId: string, secret: string): Promise<WebhookVerificationReference>;

  /**
   * Soft-delete a sealed secret. Idempotent if already deleted / missing.
   */
  deleteSecret(tenantId: string, secretId: string, kind: ChannelSecretKind): Promise<void>;
}
