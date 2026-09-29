import { ValidationError } from "../../shared/errors/DomainError";
import { isCustomerServiceWindowOpen } from "../domain/WhatsAppMessagingTypes";
import type { IMessageRepository } from "../ports/IMessagingRepositories";
import type {
  IMessagingSecretVault,
  IPlatformMessagingConnectionRepository,
  IWhatsAppCloudApiAdapter,
  IWhatsAppSessionReplySender,
  WhatsAppSessionReplyInput,
  WhatsAppSessionReplyResult,
} from "../ports/IWhatsAppMessagingPorts";

function assertSessionSendable(params: {
  channel: string;
  cswOpenUntil: Date | null | undefined;
}): void {
  if (params.channel !== "whatsapp") return;
  if (!isCustomerServiceWindowOpen(params.cswOpenUntil ?? null)) {
    throw new ValidationError(
      "WhatsApp free-form send blocked: customer service window closed",
    );
  }
}

/**
 * Synchronous Meta Cloud API session send (workerless).
 * Never logs access tokens. Leaves the Message row durable on failure.
 */
export class WhatsAppSessionReplySender implements IWhatsAppSessionReplySender {
  constructor(
    private readonly connections: IPlatformMessagingConnectionRepository,
    private readonly vault: IMessagingSecretVault,
    private readonly api: IWhatsAppCloudApiAdapter,
    private readonly messages: IMessageRepository,
  ) {}

  async deliver(
    input: WhatsAppSessionReplyInput,
  ): Promise<WhatsAppSessionReplyResult> {
    const { conversation, message } = input;

    // Idempotent: already accepted by Meta → do not re-send.
    if (
      (message.deliveryStatus === "sent" ||
        message.deliveryStatus === "delivered") &&
      message.externalMessageId
    ) {
      return { message, success: true, errorCode: null };
    }

    // Concurrent / duplicate deliver on the same Message → fail closed, no second Meta call.
    if (message.deliveryStatus === "sending") {
      return { message, success: false, errorCode: "send_in_progress" };
    }

    if (conversation.channel !== "whatsapp") {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        message.id,
        { deliveryStatus: "failed" },
      );
      return { message: updated, success: false, errorCode: "not_whatsapp" };
    }

    if (conversation.routingStatus === "ambiguous") {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        message.id,
        { deliveryStatus: "failed" },
      );
      return {
        message: updated,
        success: false,
        errorCode: "routing_ambiguous",
      };
    }

    const identity = conversation.guestChannelIdentity?.trim();
    if (!identity) {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        message.id,
        { deliveryStatus: "failed" },
      );
      return {
        message: updated,
        success: false,
        errorCode: "missing_wa_identity",
      };
    }

    try {
      assertSessionSendable({
        channel: conversation.channel,
        cswOpenUntil: conversation.cswOpenUntil,
      });
    } catch {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        message.id,
        { deliveryStatus: "failed" },
      );
      return { message: updated, success: false, errorCode: "csw_closed" };
    }

    const connection = await this.connections.findByPhoneNumberId(
      input.phoneNumberId,
    );
    if (!connection || connection.status !== "connected") {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        message.id,
        { deliveryStatus: "failed" },
      );
      return {
        message: updated,
        success: false,
        errorCode: "platform_connection_missing",
      };
    }

    if (connection.phoneNumberId !== input.phoneNumberId) {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        message.id,
        { deliveryStatus: "failed" },
      );
      return {
        message: updated,
        success: false,
        errorCode: "phone_number_id_mismatch",
      };
    }

    if (!connection.credentialRef) {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        message.id,
        { deliveryStatus: "failed" },
      );
      return {
        message: updated,
        success: false,
        errorCode: "credential_ref_missing",
      };
    }

    let accessToken: string;
    try {
      const material = await this.vault.resolvePlatformCredential(
        connection.credentialRef,
      );
      accessToken =
        material.accessToken?.trim() ||
        material.access_token?.trim() ||
        "";
      if (!accessToken) {
        throw new Error("access_token_missing");
      }
    } catch {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        message.id,
        { deliveryStatus: "failed" },
      );
      return {
        message: updated,
        success: false,
        errorCode: "credential_unseal_failed",
      };
    }

    const sending = await this.messages.updateDelivery(
      input.tenantId,
      message.id,
      { deliveryStatus: "sending" },
    );

    const toE164 = identity.startsWith("+") ? identity : `+${identity}`;
    const result = await this.api.send({
      kind: "text",
      phoneNumberId: connection.phoneNumberId,
      accessToken,
      toE164,
      textBody: message.body,
      clientMessageId: input.clientMessageId,
    });

    if (!result.success) {
      const updated = await this.messages.updateDelivery(
        input.tenantId,
        sending.id,
        { deliveryStatus: "failed" },
      );
      return {
        message: updated,
        success: false,
        errorCode: result.errorCode ?? "meta_send_failed",
      };
    }

    const updated = await this.messages.updateDelivery(
      input.tenantId,
      sending.id,
      {
        deliveryStatus: "sent",
        externalMessageId: result.externalMessageId,
      },
    );
    return { message: updated, success: true, errorCode: null };
  }
}
