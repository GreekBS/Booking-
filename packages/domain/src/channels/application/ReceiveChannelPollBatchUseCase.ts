import type { ReceiveChannelPollBatchResult } from "../types/ChannelIngressOrchestrationTypes";

import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";

import type { IChannelCredentialResolver } from "../ports/IChannelCredentialResolver";

import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";

import type { ChannelPollExecutionContext } from "../types/ChannelTransportExecutionContext";

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

import {

  isIcalTrustedIngressPollingProvider,

} from "../providers/ical/ingress/IIcalTrustedIngressPollingProvider";

import { isChannelPollingDeliveryAcknowledger } from "../ports/providers/IChannelPollingDeliveryAcknowledger";

import type { IChannelPollDiagnosticsReporter } from "../ports/IChannelPollDiagnosticsReporter";

import { NoOpChannelPollDiagnosticsReporter } from "../ports/IChannelPollDiagnosticsReporter";



export interface ReceiveChannelPollBatchCommand extends ChannelIngressOrchestrationCommandBase {

  cursorPayload: string | null;

}



export class ReceiveChannelPollBatchUseCase {

  constructor(

    private readonly connectionRepository: IChannelConnectionRepository,

    private readonly credentialResolver: IChannelCredentialResolver,

    private readonly providerRegistry: IChannelProviderRegistry,

    private readonly batchProcessor: ChannelIngressBatchProcessor,

    private readonly pollDiagnosticsReporter: IChannelPollDiagnosticsReporter = new NoOpChannelPollDiagnosticsReporter(),

  ) {}



  async execute(command: ReceiveChannelPollBatchCommand): Promise<ReceiveChannelPollBatchResult> {

    const tenantId = command.tenantId.trim();

    const connectionId = command.connectionId.trim();



    const connection = await this.connectionRepository.findById(tenantId, connectionId);

    const connectionValidation = validateChannelIngressConnection(connection, command.provider);

    if (!connectionValidation.ok) {

      return {

        ...buildIngressFailureResult("connection", connectionValidation.reason),

        proposedNextCursor: null,

      };

    }



    const registration = this.providerRegistry.get(command.provider);

    if (!registration?.capabilities.inbound.polling || !registration.polling) {

      return {

        ...buildIngressFailureResult("provider_registration", "Polling provider is not registered"),

        proposedNextCursor: null,

      };

    }



    const pollAuthPolicy = registration.pollAuthPolicy;

    if (!pollAuthPolicy) {

      return {

        ...buildIngressFailureResult("provider_registration", "Poll auth policy is not configured"),

        proposedNextCursor: null,

      };

    }



    const pollContext: ChannelPollExecutionContext = {};

    if (pollAuthPolicy.requiresCredentialRef) {

      const credentialRef = connectionValidation.connection.credentialRef;

      if (!credentialRef) {

        return {

          ...buildIngressFailureResult("connection", "Credential reference is required"),

          proposedNextCursor: null,

        };

      }

      try {

        const resolved = await this.credentialResolver.resolveCredential(credentialRef);

        pollContext.credentialMaterial = resolved.material;

      } catch (error) {

        return {

          ...buildIngressFailureResult(

            "connection",

            error instanceof Error ? error.message : "Credential resolution failed",

          ),

          proposedNextCursor: null,

        };

      }

    }



    const polling = registration.polling;



    if (isIcalTrustedIngressPollingProvider(polling)) {

      let trustedResult;

      try {

        trustedResult = await polling.pollTrustedIngress(

          connectionId,

          command.cursorPayload,

          pollContext,

        );

      } catch (error) {

        return {

          ...buildIngressFailureResult(

            "poll",

            error instanceof Error ? error.message : "Polling failed",

          ),

          proposedNextCursor: null,

        };

      }



      if (trustedResult.mapIssueCodes.length > 0) {

        this.pollDiagnosticsReporter.reportIcalMapIssues({

          tenantId,

          connectionId,

          provider: command.provider,

          issueCodes: trustedResult.mapIssueCodes,

          evidenceRecordCount: trustedResult.evidenceRecordCount,

        });

      }



      const messages = trustedResult.items.map((item) => item.message);

      const provenance = validateParsedMessageProvenance(

        messages,

        connectionValidation.connection,

        connectionId,

      );

      if (!provenance.ok) {

        return {

          ...buildIngressFailureResult("provenance", provenance.reason),

          proposedNextCursor: null,

        };

      }



      const knownKinds = validateKnownIngressMessageKinds(messages);

      if (!knownKinds.ok) {

        return {

          ...buildIngressFailureResult("malformed", knownKinds.errorMessage),

          proposedNextCursor: null,

        };

      }



      const identity = validateParsedMessageIdentities(messages);

      if (!identity.ok) {

        return {

          ...buildIngressFailureResult("malformed", identity.errorMessage),

          proposedNextCursor: null,

        };

      }



      const trustedItemsToReceive = trustedResult.items.filter((item) =>

        selectMessagesForReceive(

          [item.message],

          registration.maintenanceEventPolicy.connectivityTestIngress,

        ).some((selected) => selected.messageId === item.message.messageId),

      );



      const batchResult = await this.batchProcessor.processBatch({

        tenantId,

        connectionId,

        ingressKind: "poll",

        items: trustedItemsToReceive,

      });



      return {

        ...batchResult,

        proposedNextCursor: trustedResult.nextCursor,

        inventoryActionableSnapshot: trustedResult.inventoryActionableSnapshot,

        inventoryProjectionFailureCode: trustedResult.inventoryProjectionFailureCode,

      };

    }



    let pollResult;

    try {

      pollResult = await polling.poll(connectionId, command.cursorPayload, pollContext);

    } catch (error) {

      return {

        ...buildIngressFailureResult(

          "poll",

          error instanceof Error ? error.message : "Polling failed",

        ),

        proposedNextCursor: null,

      };

    }



    const provenance = validateParsedMessageProvenance(

      pollResult.messages,

      connectionValidation.connection,

      connectionId,

    );

    if (!provenance.ok) {

      return {

        ...buildIngressFailureResult("provenance", provenance.reason),

        proposedNextCursor: null,

      };

    }



    const knownKinds = validateKnownIngressMessageKinds(pollResult.messages);

    if (!knownKinds.ok) {

      return {

        ...buildIngressFailureResult("malformed", knownKinds.errorMessage),

        proposedNextCursor: null,

      };

    }



    const identity = validateParsedMessageIdentities(pollResult.messages);

    if (!identity.ok) {

      return {

        ...buildIngressFailureResult("malformed", identity.errorMessage),

        proposedNextCursor: null,

      };

    }



    const messagesToReceive = selectMessagesForReceive(

      pollResult.messages,

      registration.maintenanceEventPolicy.connectivityTestIngress,

    );



    const batchResult = await this.batchProcessor.processBatch({

      tenantId,

      connectionId,

      ingressKind: "poll",

      items: messagesToReceive,

    });

    if (
      batchResult.ackAllowed &&
      messagesToReceive.length > 0 &&
      isChannelPollingDeliveryAcknowledger(polling)
    ) {
      const successfulIds = new Set(
        batchResult.results.filter((r) => r.success).map((r) => r.messageId),
      );
      const toAck = messagesToReceive.filter((m) => successfulIds.has(m.messageId));
      try {
        await polling.acknowledgeDelivered({
          connectionId,
          messages: toAck,
          credentialMaterial: pollContext.credentialMaterial,
        });
      } catch {
        // Durable Receive already succeeded — inbox evidence retained.
      }
    }

    return {

      ...batchResult,

      proposedNextCursor: pollResult.nextCursor,

    };

  }

}


