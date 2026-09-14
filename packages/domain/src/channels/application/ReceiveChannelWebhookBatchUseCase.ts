import type { ChannelWebhookRequestMeta } from "../types/ChannelWebhookTransportTypes";
import { decodeUtf8Bytes } from "../../shared/kernel/Utf8Bytes";
import type { ChannelIngressOrchestrationResult } from "../types/ChannelIngressOrchestrationTypes";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelCredentialResolver } from "../ports/IChannelCredentialResolver";
import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { ChannelWebhookVerifyContext } from "../types/ChannelTransportExecutionContext";
import { validateChannelIngressConnection } from "./ChannelIngressConnectionGuard";
import { validateParsedMessageProvenance } from "./ChannelIngressProvenanceGuard";
import {
  selectMessagesForReceive,
  validateKnownIngressMessageKinds,
  validateParsedMessageIdentities,
} from "./ChannelIngressIdentityValidator";
import type { ChannelIngressBatchProcessor } from "./ChannelIngressBatchProcessor";
import {
  buildIngressFailureResult,
  type ChannelIngressOrchestrationCommandBase,
} from "./ChannelIngressOrchestrationSupport";

export interface ReceiveChannelWebhookBatchCommand extends ChannelIngressOrchestrationCommandBase {
  request: ChannelWebhookRequestMeta;
}

export class ReceiveChannelWebhookBatchUseCase {
  constructor(
    private readonly connectionRepository: IChannelConnectionRepository,
    private readonly credentialResolver: IChannelCredentialResolver,
    private readonly providerRegistry: IChannelProviderRegistry,
    private readonly batchProcessor: ChannelIngressBatchProcessor,
  ) {}

  async execute(command: ReceiveChannelWebhookBatchCommand): Promise<ChannelIngressOrchestrationResult> {
    const tenantId = command.tenantId.trim();
    const connectionId = command.connectionId.trim();

    const connection = await this.connectionRepository.findById(tenantId, connectionId);
    const connectionValidation = validateChannelIngressConnection(connection, command.provider);
    if (!connectionValidation.ok) {
      return buildIngressFailureResult("connection", connectionValidation.reason);
    }

    const registration = this.providerRegistry.get(command.provider);
    if (!registration?.capabilities.inbound.webhooks || !registration.webhooks) {
      return buildIngressFailureResult("provider_registration", "Webhook provider is not registered");
    }

    const webhookAuthPolicy = registration.webhookAuthPolicy;
    if (!webhookAuthPolicy) {
      return buildIngressFailureResult(
        "provider_registration",
        "Webhook auth policy is not configured",
      );
    }

    const verifyContext: ChannelWebhookVerifyContext = {};
    if (webhookAuthPolicy.requiresWebhookVerificationRef) {
      const webhookRef = connectionValidation.connection.webhookVerificationRef;
      if (!webhookRef) {
        return buildIngressFailureResult(
          "connection",
          "Webhook verification reference is required",
        );
      }
      try {
        const resolved = await this.credentialResolver.resolveWebhookVerification(webhookRef);
        verifyContext.webhookSecret = resolved.secret;
      } catch (error) {
        return buildIngressFailureResult(
          "connection",
          error instanceof Error ? error.message : "Credential resolution failed",
        );
      }
    }

    if (webhookAuthPolicy.requiresCredentialRef) {
      const credentialRef = connectionValidation.connection.credentialRef;
      if (!credentialRef) {
        return buildIngressFailureResult("connection", "Credential reference is required");
      }
      try {
        const resolved = await this.credentialResolver.resolveCredential(credentialRef);
        verifyContext.credentialMaterial = resolved.material;
      } catch (error) {
        return buildIngressFailureResult(
          "connection",
          error instanceof Error ? error.message : "Credential resolution failed",
        );
      }
    }

    const verification = await registration.webhooks.verify(command.request, verifyContext);
    if (!verification.accepted) {
      return buildIngressFailureResult("verify", verification.reason);
    }

    let parsedMessages;
    try {
      const payloadText = command.request.rawBodyBytes
        ? decodeUtf8Bytes(command.request.rawBodyBytes)
        : command.request.rawBody;
      parsedMessages = await registration.webhooks.parse(JSON.parse(payloadText));
    } catch (error) {
      return buildIngressFailureResult(
        "parse",
        error instanceof Error ? error.message : "Failed to parse webhook payload",
      );
    }

    const provenance = validateParsedMessageProvenance(
      parsedMessages,
      connectionValidation.connection,
      connectionId,
    );
    if (!provenance.ok) {
      return buildIngressFailureResult("provenance", provenance.reason);
    }

    const knownKinds = validateKnownIngressMessageKinds(parsedMessages);
    if (!knownKinds.ok) {
      return buildIngressFailureResult("malformed", knownKinds.errorMessage);
    }

    const identity = validateParsedMessageIdentities(parsedMessages);
    if (!identity.ok) {
      return buildIngressFailureResult("malformed", identity.errorMessage);
    }

    const messagesToReceive = selectMessagesForReceive(
      parsedMessages,
      registration.maintenanceEventPolicy.connectivityTestIngress,
    );

    const batchResult = await this.batchProcessor.processBatch({
      tenantId,
      connectionId,
      ingressKind: "webhook",
      items: messagesToReceive,
    });

    return batchResult;
  }
}
