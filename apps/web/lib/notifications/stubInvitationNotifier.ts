import type {
  IInvitationNotifier,
  SendInvitationNotification,
} from "@hcp/domain";
import { createLogger } from "../logging/logger";

const logger = createLogger({ action: "invitation.send" });

export const stubInvitationNotifier: IInvitationNotifier = {
  async sendInvitation(notification: SendInvitationNotification): Promise<void> {
    logger.info("Invitation email stub", {
      email: notification.email,
      tenantId: notification.tenantId,
      invitationId: notification.invitationId,
      rawToken: notification.rawToken,
    });
  },
};
