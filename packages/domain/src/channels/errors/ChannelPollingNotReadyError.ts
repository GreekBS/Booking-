import { DomainError } from "../../shared/errors/DomainError";

/**
 * Fail-closed polling skeleton (P1-S1): provider is discoverable but not
 * operational. Thrown so poll orchestration records failure with no proposed
 * cursor and no cursor CAS.
 */
export class ChannelPollingNotReadyError extends DomainError {
  static readonly CODE = "CHANNEL_POLLING_NOT_READY" as const;

  constructor(providerId: string) {
    super(
      `Channel polling is not ready for provider: ${providerId}`,
      ChannelPollingNotReadyError.CODE,
    );
  }
}
