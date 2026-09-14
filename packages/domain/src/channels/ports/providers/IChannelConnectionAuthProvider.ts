export interface AuthInitiationResult {
  redirectUrl: string;
}

export type AuthValidationResult =
  | { status: "valid" }
  | { status: "expired" | "revoked" | "invalid" };

export interface IChannelConnectionAuthProvider {
  initiateAuth(params: { connectionId: string }): Promise<AuthInitiationResult>;
  validateConnection(connectionId: string): Promise<AuthValidationResult>;
}
