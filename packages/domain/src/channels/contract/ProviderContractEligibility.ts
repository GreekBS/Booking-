import type { ChannelProviderRegistration } from "../ports/providers/ChannelProviderRegistration";

export type ProviderPayloadFormat = "json" | "non_json";
export type WebhookVerificationMode =
  | "signed_raw_body"
  | "header_token"
  | "query_token"
  | "none";
export type PollingCursorMode = "cursor" | "cursorless";

export interface ProviderContractEligibility {
  providerId: ChannelProviderRegistration["providerId"];
  webhookCapable: boolean;
  pollingCapable: boolean;
  payloadFormat: ProviderPayloadFormat;
  webhookVerification: WebhookVerificationMode;
  pollingCursor: PollingCursorMode;
  maintenanceReceive: boolean;
  maintenanceAckWithoutPersist: boolean;
  destructiveCursor?: boolean;
}

export function deriveProviderContractEligibility(
  registration: ChannelProviderRegistration,
  overrides: Partial<ProviderContractEligibility> = {},
): ProviderContractEligibility {
  const webhookCapable =
    registration.capabilities.inbound.webhooks && registration.webhooks != null;
  const pollingCapable =
    registration.capabilities.inbound.polling && registration.polling != null;

  return {
    providerId: registration.providerId,
    webhookCapable,
    pollingCapable,
    payloadFormat: overrides.payloadFormat ?? "json",
    webhookVerification:
      overrides.webhookVerification ??
      (webhookCapable && registration.webhookAuthPolicy?.requiresWebhookVerificationRef
        ? "signed_raw_body"
        : "none"),
    pollingCursor: overrides.pollingCursor ?? "cursor",
    maintenanceReceive:
      overrides.maintenanceReceive ??
      registration.maintenanceEventPolicy.connectivityTestIngress === "receive",
    maintenanceAckWithoutPersist:
      overrides.maintenanceAckWithoutPersist ??
      registration.maintenanceEventPolicy.connectivityTestIngress === "ack_without_persist",
    destructiveCursor: overrides.destructiveCursor ?? false,
  };
}
