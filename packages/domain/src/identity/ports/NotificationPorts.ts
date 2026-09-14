export interface SendInvitationNotification {
  email: string;
  tenantId: string;
  invitationId: string;
  rawToken: string;
}

export interface IInvitationNotifier {
  sendInvitation(notification: SendInvitationNotification): Promise<void>;
}
