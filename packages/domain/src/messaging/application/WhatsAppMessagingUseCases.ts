import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { IPropertyRepository } from "../../catalog/ports/ICatalogRepositories";
import type { IBookingRepository } from "../../commerce/ports/CommercePorts";
import type { IGuestRepository } from "../../guests/ports/IGuestRepository";
import { EnqueueJobUseCase } from "../../platform/async/jobs/application/EnqueueJobUseCase";
import { MESSAGING_AUTOMATION_DISPATCH_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import { canWriteMessagingOnProperty } from "./messagingAccess";
import type { IConversationRepository } from "../ports/IMessagingRepositories";
import type {
  IBookingMessagingProfileRepository,
  IMessagingAutomationRunRepository,
  IPropertyMessagingSettingsRepository,
} from "../ports/IWhatsAppMessagingPorts";
import type { ConversationRecord } from "../domain/MessagingTypes";
import {
  isCustomerServiceWindowOpen,
  normalizeWhatsAppE164,
  whatsappChannelIdentityFromE164,
  whatsappChannelIdentityFromSender,
  type BookingMessagingProfileRecord,
  type PropertyMessagingSettingsRecord,
} from "../domain/WhatsAppMessagingTypes";
import {
  arrivalOccurrenceKey,
  computeArrivalScheduledFor,
  WELCOME_OCCURRENCE_KEY,
} from "./ArrivalSchedule";

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function assertWhatsAppSessionSendable(params: {
  channel: string;
  cswOpenUntil: Date | null | undefined;
  now?: Date;
}): void {
  if (params.channel !== "whatsapp") return;
  if (!isCustomerServiceWindowOpen(params.cswOpenUntil ?? null, params.now)) {
    throw new ValidationError(
      "WhatsApp customer service window is closed — free-form send blocked",
    );
  }
}

export type WhatsAppInboundRouteOutcome =
  | { outcome: "routed"; profile: BookingMessagingProfileRecord }
  | { outcome: "ambiguous"; profiles: BookingMessagingProfileRecord[] }
  | { outcome: "unmatched" };

/**
 * Confirm/enter Booking WhatsApp contact, enable messaging, bind Conversation.
 */
export class EnableBookingWhatsAppMessagingUseCase {
  constructor(
    private readonly profiles: IBookingMessagingProfileRepository,
    private readonly settings: IPropertyMessagingSettingsRepository,
    private readonly conversations: IConversationRepository,
    private readonly bookings: IBookingRepository,
    private readonly properties: IPropertyRepository,
    private readonly guests: IGuestRepository,
    private readonly automations: IMessagingAutomationRunRepository,
    private readonly enqueueJob: EnqueueJobUseCase,
    private readonly permissionChecker: PermissionChecker,
    private readonly ids: IIdGenerator,
    private readonly audit?: IAuditLogRepository,
  ) {}

  async execute(
    input: {
      tenantId: string;
      bookingId: string;
      whatsappPhone: string;
      messagingEnabled?: boolean;
      alsoUpdateGuestCrm?: boolean;
    },
    actor: ActorContext,
  ): Promise<
    Result<
      {
        profile: BookingMessagingProfileRecord;
        conversation: ConversationRecord;
      },
      Error
    >
  > {
    try {
      const booking = await this.bookings.findById(
        input.bookingId,
        input.tenantId,
      );
      if (!booking) {
        return Result.fail(new NotFoundError("Booking", input.bookingId));
      }
      if (
        !canWriteMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          booking.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const e164 = normalizeWhatsAppE164(input.whatsappPhone);
      if (!e164) {
        return Result.fail(
          new ValidationError(
            "WhatsApp phone must be E.164 with country code (e.g. +3069...)",
          ),
        );
      }
      const identity = whatsappChannelIdentityFromE164(e164);
      const now = new Date();
      const messagingEnabled = input.messagingEnabled !== false;

      let profile = await this.profiles.findByBookingId(
        input.tenantId,
        booking.id,
      );

      let conversation: ConversationRecord | null = null;
      if (profile?.conversationId) {
        conversation = await this.conversations.findById(
          input.tenantId,
          profile.conversationId,
        );
      }

      if (!conversation) {
        conversation = await this.conversations.create({
          id: this.ids.generate(),
          tenantId: input.tenantId,
          propertyId: booking.propertyId,
          guestId: booking.guestId,
          bookingId: booking.id,
          channel: "whatsapp",
          externalThreadId: `wa:${identity}:${booking.id}`,
          guestChannelIdentity: identity,
          cswOpenUntil: null,
          lastGuestInboundAt: null,
          routingStatus: "ok",
          status: "open",
          subject: `WhatsApp · ${booking.guest.name}`,
          lastMessageAt: null,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        conversation = await this.conversations.updateMeta(
          input.tenantId,
          conversation.id,
          {
            guestId: booking.guestId,
            bookingId: booking.id,
            guestChannelIdentity: identity,
            externalThreadId: `wa:${identity}:${booking.id}`,
            routingStatus: "ok",
            status:
              conversation.status === "archived" ? "open" : conversation.status,
          },
        );
      }

      profile = await this.profiles.upsert({
        id: profile?.id ?? this.ids.generate(),
        tenantId: input.tenantId,
        propertyId: booking.propertyId,
        bookingId: booking.id,
        guestId: booking.guestId,
        conversationId: conversation.id,
        whatsappPhone: e164,
        whatsappPhoneNormalized: e164,
        guestChannelIdentity: identity,
        contactSource: "manual",
        contactConfirmedAt: now,
        messagingEnabled,
        identityStatus: "bound",
        cswOpenUntil: profile?.cswOpenUntil ?? null,
        lastGuestInboundAt: profile?.lastGuestInboundAt ?? null,
        createdAt: profile?.createdAt ?? now,
        updatedAt: now,
      });

      if (input.alsoUpdateGuestCrm && booking.guestId) {
        const guest = await this.guests.findById(
          input.tenantId,
          booking.guestId,
        );
        if (guest) {
          guest.updateProfile({ phone: e164 });
          await this.guests.save(guest);
        }
      }

      await this.audit?.append({
        tenantId: input.tenantId,
        actorId: actor.userId,
        action: "messaging.booking_whatsapp_enabled",
        resourceType: "booking_messaging_profile",
        resourceId: profile.id,
        metadata: {
          bookingId: booking.id,
          conversationId: conversation.id,
          alsoUpdateGuestCrm: Boolean(input.alsoUpdateGuestCrm),
        },
        ipAddress: null,
      });

      if (messagingEnabled && booking.status === "confirmed") {
        await this.scheduleAutomationsForEnabledBooking({
          tenantId: input.tenantId,
          bookingId: booking.id,
          propertyId: booking.propertyId,
          conversationId: conversation.id,
          checkIn: booking.stayPeriod.checkIn.value,
        });
      }

      return Result.ok({ profile, conversation });
    } catch (error) {
      return Result.fail(toError(error));
    }
  }

  private async scheduleAutomationsForEnabledBooking(params: {
    tenantId: string;
    bookingId: string;
    propertyId: string;
    conversationId: string;
    checkIn: string;
  }): Promise<void> {
    const settings = await this.settings.get(
      params.tenantId,
      params.propertyId,
    );
    if (!settings) return;

    if (settings.welcomeEnabled && settings.welcomeTemplateName) {
      await this.ensureAutomationRun({
        tenantId: params.tenantId,
        propertyId: params.propertyId,
        bookingId: params.bookingId,
        conversationId: params.conversationId,
        trigger: "welcome",
        occurrenceKey: WELCOME_OCCURRENCE_KEY,
        scheduledFor: new Date(),
      });
    }

    if (settings.arrivalEnabled && settings.arrivalTemplateName) {
      const property = await this.properties.findById(
        params.tenantId,
        params.propertyId,
      );
      const scheduledFor = computeArrivalScheduledFor({
        checkInDate: params.checkIn,
        timezone: property?.timezone ?? "Europe/Athens",
        timingMode: settings.arrivalTimingMode,
        localTime: settings.arrivalLocalTime,
        offsetDays: settings.arrivalOffsetDays,
        offsetHours: settings.arrivalOffsetHours,
      });
      if (scheduledFor) {
        await this.ensureAutomationRun({
          tenantId: params.tenantId,
          propertyId: params.propertyId,
          bookingId: params.bookingId,
          conversationId: params.conversationId,
          trigger: "arrival",
          occurrenceKey: arrivalOccurrenceKey(params.checkIn),
          scheduledFor,
        });
      }
    }
  }

  private async ensureAutomationRun(params: {
    tenantId: string;
    propertyId: string;
    bookingId: string;
    conversationId: string;
    trigger: "welcome" | "arrival";
    occurrenceKey: string;
    scheduledFor: Date;
  }): Promise<void> {
    const existing = await this.automations.findByBookingTriggerOccurrence(
      params.tenantId,
      params.bookingId,
      params.trigger,
      params.occurrenceKey,
    );
    if (existing && ["sent", "sending", "enqueued"].includes(existing.status)) {
      return;
    }
    if (existing && existing.status === "scheduled") {
      await this.automations.update(params.tenantId, existing.id, {
        scheduledFor: params.scheduledFor,
        conversationId: params.conversationId,
        status: "scheduled",
      });
    } else if (!existing) {
      const now = new Date();
      await this.automations.create({
        id: this.ids.generate(),
        tenantId: params.tenantId,
        propertyId: params.propertyId,
        bookingId: params.bookingId,
        conversationId: params.conversationId,
        trigger: params.trigger,
        occurrenceKey: params.occurrenceKey,
        status: "scheduled",
        scheduledFor: params.scheduledFor,
        messageId: null,
        jobId: null,
        errorCode: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      });
    }

    await this.enqueueJob.execute({
      tenantId: params.tenantId,
      jobType: MESSAGING_AUTOMATION_DISPATCH_JOB_TYPE,
      payload: {
        bookingId: params.bookingId,
        trigger: params.trigger,
        occurrenceKey: params.occurrenceKey,
      },
      runAt: params.scheduledFor,
      idempotencyKey: `msg-auto:${params.bookingId}:${params.trigger}:${params.occurrenceKey}`,
      maxAttempts: 8,
    });
  }
}

export class UpsertPropertyMessagingSettingsUseCase {
  constructor(
    private readonly settings: IPropertyMessagingSettingsRepository,
    private readonly properties: IPropertyRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly ids: IIdGenerator,
  ) {}

  async execute(
    input: Omit<
      PropertyMessagingSettingsRecord,
      "id" | "createdAt" | "updatedAt"
    > & { id?: string },
    actor: ActorContext,
  ): Promise<Result<PropertyMessagingSettingsRecord, Error>> {
    try {
      if (
        !canWriteMessagingOnProperty(
          this.permissionChecker,
          actor,
          input.tenantId,
          input.propertyId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }
      const property = await this.properties.findById(
        input.tenantId,
        input.propertyId,
      );
      if (!property || property.deletedAt) {
        return Result.fail(new NotFoundError("Property", input.propertyId));
      }
      const existing = await this.settings.get(input.tenantId, input.propertyId);
      const now = new Date();
      const saved = await this.settings.upsert({
        id: existing?.id ?? input.id ?? this.ids.generate(),
        tenantId: input.tenantId,
        propertyId: input.propertyId,
        whatsappEnabled: input.whatsappEnabled,
        welcomeEnabled: input.welcomeEnabled,
        welcomeTemplateName: input.welcomeTemplateName,
        welcomeTemplateLanguage: input.welcomeTemplateLanguage || "en",
        arrivalEnabled: input.arrivalEnabled,
        arrivalTemplateName: input.arrivalTemplateName,
        arrivalTemplateLanguage: input.arrivalTemplateLanguage || "en",
        arrivalTimingMode: input.arrivalTimingMode,
        arrivalLocalTime: input.arrivalLocalTime || "09:00",
        arrivalOffsetDays: input.arrivalOffsetDays ?? 0,
        arrivalOffsetHours: input.arrivalOffsetHours ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      return Result.ok(saved);
    } catch (error) {
      return Result.fail(toError(error));
    }
  }
}

/**
 * Route inbound WhatsApp sender → bound Booking profile.
 * Never guesses across ambiguous / cross-tenant matches.
 */
export class RouteWhatsAppInboundUseCase {
  constructor(
    private readonly profiles: IBookingMessagingProfileRepository,
    private readonly bookings: IBookingRepository,
  ) {}

  async execute(input: {
    guestChannelIdentity: string;
    now?: Date;
  }): Promise<WhatsAppInboundRouteOutcome> {
    const now = input.now ?? new Date();
    const matches = await this.profiles.findEnabledByIdentity(
      input.guestChannelIdentity,
    );
    if (matches.length === 0) {
      return { outcome: "unmatched" };
    }

    const tenants = new Set(matches.map((m) => m.tenantId));
    if (tenants.size > 1) {
      return { outcome: "ambiguous", profiles: matches };
    }

    const eligible: BookingMessagingProfileRecord[] = [];
    for (const profile of matches) {
      if (!profile.conversationId || !profile.messagingEnabled) continue;
      const booking = await this.bookings.findById(
        profile.bookingId,
        profile.tenantId,
      );
      if (!booking) continue;
      if (booking.status === "cancelled") continue;
      if (booking.status !== "confirmed" && booking.status !== "completed") {
        continue;
      }
      const checkIn = parseDateOnly(booking.stayPeriod.checkIn.value);
      const checkOut = parseDateOnly(booking.stayPeriod.checkOut.value);
      const graceMs = 2 * 24 * 60 * 60 * 1000;
      if (
        now.getTime() + graceMs < checkIn.getTime() ||
        now.getTime() - graceMs > checkOut.getTime()
      ) {
        continue;
      }
      eligible.push(profile);
    }

    const candidates =
      eligible.length > 0
        ? eligible
        : matches.filter((m) => m.messagingEnabled && m.conversationId);

    if (candidates.length === 0) {
      return { outcome: "unmatched" };
    }
    if (candidates.length > 1) {
      return { outcome: "ambiguous", profiles: candidates };
    }

    return { outcome: "routed", profile: candidates[0]! };
  }
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

export {
  whatsappChannelIdentityFromSender,
  normalizeWhatsAppE164,
  isCustomerServiceWindowOpen,
};
