import type { Property } from "../../catalog/domain/Property";
import type {
  MessageRecord,
  PropertyAssistantProfileRecord,
  PropertyFaqItemRecord,
  PropertyGuestKnowledgeRecord,
} from "../domain/MessagingTypes";
import type {
  AssistantContext,
  AssistantContextAmenity,
} from "../ports/IAssistantProvider";
import { amenitySourceId } from "../ports/IAssistantProvider";

export const DEFAULT_RECENT_MESSAGE_LIMIT = 20;
export const DEFAULT_MAX_MESSAGE_BODY_LENGTH = 2000;

export { amenitySourceId };

export interface AssistantPropertySnapshot {
  id: string;
  name: string;
  type: string;
  description: string | null;
  checkInTime: string;
  checkOutTime: string;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

export function toAssistantPropertySnapshot(
  property: Property,
): AssistantPropertySnapshot {
  return {
    id: property.id,
    name: property.name,
    type: property.type,
    description: property.description,
    checkInTime: property.policies.checkInTime,
    checkOutTime: property.policies.checkOutTime,
    addressLine: property.location.addressLine,
    city: property.location.city,
    region: property.location.region,
    postalCode: property.location.postalCode,
    country: property.location.country,
  };
}

export interface AssistantStayInput {
  guestDisplayName?: string | null;
  guestFirstName?: string | null;
  checkIn?: string | Date | null;
  checkOut?: string | Date | null;
  guestCount?: number | null;
  bookingStatus?: string | null;
}

export interface BuildAssistantContextInput {
  property: AssistantPropertySnapshot;
  profile: PropertyAssistantProfileRecord;
  knowledge: PropertyGuestKnowledgeRecord | null;
  faqs: PropertyFaqItemRecord[];
  /** Authoritative Property amenities (tenant+property scoped). */
  amenities?: AssistantContextAmenity[];
  stay?: AssistantStayInput | null;
  messages: MessageRecord[];
  recentMessageLimit?: number;
  maxMessageBodyLength?: number;
}

/** Builds allow-listed AI context. Never includes notes/payments/fiscal/secrets beyond guest Wi‑Fi. */
export function buildAssistantContext(
  input: BuildAssistantContextInput,
): AssistantContext {
  const limit = input.recentMessageLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT;
  const maxBody = input.maxMessageBodyLength ?? DEFAULT_MAX_MESSAGE_BODY_LENGTH;
  const k = input.knowledge;

  const amenities = (input.amenities ?? [])
    .map((a) => ({
      id: a.id.trim(),
      name: a.name.trim(),
    }))
    .filter((a) => a.id.length > 0 && a.name.length > 0);

  return {
    property: {
      id: input.property.id,
      name: input.property.name,
      type: input.property.type,
      description: input.property.description,
      checkInTime: input.property.checkInTime,
      checkOutTime: input.property.checkOutTime,
      location: {
        addressLine: input.property.addressLine,
        city: input.property.city,
        region: input.property.region,
        postalCode: input.property.postalCode,
        country: input.property.country,
      },
      amenities,
    },
    knowledge: k
      ? {
          guestFacingSummary: k.guestFacingSummary,
          earlyCheckInPolicy: k.earlyCheckInPolicy,
          lateCheckoutPolicy: k.lateCheckoutPolicy,
          directions: k.directions,
          parkingInfo: k.parkingInfo,
          accessInstructions: k.accessInstructions,
          wifiSsid: k.wifiSsid,
          wifiPassword: k.wifiPassword,
          poolInfo: k.poolInfo,
          hvacInstructions: k.hvacInstructions,
          applianceNotes: k.applianceNotes,
          amenityNotes: k.amenityNotes,
          houseRules: k.houseRules,
          smokingPolicy: k.smokingPolicy,
          petsPolicy: k.petsPolicy,
          quietHours: k.quietHours,
          transportInfo: k.transportInfo,
          taxiInfo: k.taxiInfo,
          beaches: k.beaches,
          restaurants: k.restaurants,
          supermarkets: k.supermarkets,
          recommendations: k.recommendations,
          guestFacingPhone: k.guestFacingPhone,
          guestFacingEmail: k.guestFacingEmail,
          emergencyContact: k.emergencyContact,
        }
      : null,
    faqs: input.faqs
      .filter((f) => f.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((f) => ({
        id: f.id,
        question: f.question.trim(),
        answer: f.answer.trim(),
      })),
    style: {
      tone: input.profile.tone,
      formality: input.profile.formality,
      emojiPolicy: input.profile.emojiPolicy,
      useGuestFirstName: input.profile.useGuestFirstName,
      replyLength: input.profile.replyLength,
      signOff: input.profile.signOff,
      preferGuestLanguage: input.profile.preferGuestLanguage,
      defaultLocale: input.profile.defaultLocale,
      customVoiceNotes: input.profile.customVoiceNotes,
    },
    stay: input.stay
      ? {
          guestDisplayName: input.stay.guestDisplayName?.trim() || null,
          guestFirstName: input.stay.guestFirstName?.trim() || null,
          checkIn: toIsoDate(input.stay.checkIn),
          checkOut: toIsoDate(input.stay.checkOut),
          guestCount: input.stay.guestCount ?? null,
          bookingStatus: input.stay.bookingStatus?.trim() || null,
        }
      : null,
    recentMessages: (limit > 0 ? input.messages.slice(-limit) : []).map((m) => ({
      direction: m.direction,
      senderType: m.senderType,
      body: truncate(m.body, maxBody),
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export class AssistantContextBuilder {
  build(input: BuildAssistantContextInput): AssistantContext {
    return buildAssistantContext(input);
  }
}

function toIsoDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.trim() || null;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}
