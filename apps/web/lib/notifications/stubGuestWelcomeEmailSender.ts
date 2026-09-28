import type { GuestWelcomeEmailPayload, IGuestWelcomeEmailSender } from "@hcp/domain";
import { createLogger } from "@/lib/logging/logger";

const logger = createLogger({ action: "messaging.welcome_email" });

/**
 * Stub Welcome Email transport — logs delivery intent without secrets/tokens.
 * Swap for a real provider (Resend/SMTP) without changing domain use cases.
 */
export const stubGuestWelcomeEmailSender: IGuestWelcomeEmailSender = {
  async sendWelcome(payload: GuestWelcomeEmailPayload): Promise<void> {
    const emailDomain = payload.to.includes("@")
      ? payload.to.split("@")[1]
      : null;
    logger.info("Welcome email stub send", {
      emailDomain,
      propertyName: payload.propertyName,
      guestName: payload.guestName,
      checkIn: payload.checkIn,
      checkOut: payload.checkOut,
      // Deep link contains opaque token — log host only.
      whatsappHost: "wa.me",
      hasDeepLink: Boolean(payload.whatsappDeepLink),
    });
  },
};

/** In-memory capture for tests / verification. */
export class CapturingGuestWelcomeEmailSender implements IGuestWelcomeEmailSender {
  readonly sent: GuestWelcomeEmailPayload[] = [];
  failNext = false;

  async sendWelcome(payload: GuestWelcomeEmailPayload): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("email_provider_failure");
    }
    this.sent.push(payload);
  }
}
