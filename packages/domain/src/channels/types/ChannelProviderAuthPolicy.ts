export type ConnectivityTestIngressPolicy = "receive" | "ack_without_persist";

export interface ChannelWebhookAuthPolicy {
  requiresVerification: true;
  requiresWebhookVerificationRef: boolean;
  requiresCredentialRef: boolean;
}

export interface ChannelPollAuthPolicy {
  requiresCredentialRef: boolean;
}

export interface ChannelMaintenanceEventPolicy {
  connectivityTestIngress: ConnectivityTestIngressPolicy;
}

export const DEFAULT_MAINTENANCE_EVENT_POLICY: ChannelMaintenanceEventPolicy = {
  connectivityTestIngress: "ack_without_persist",
};
