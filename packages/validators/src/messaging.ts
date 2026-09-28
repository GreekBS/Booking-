import { z } from "zod";

const uuid = z.string().uuid();

const boolFromQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => v === "true");

export const listConversationsQuerySchema = z.object({
  propertyId: uuid.optional(),
  entireTenant: boolFromQuery,
});

export const listEscalationsQuerySchema = listConversationsQuerySchema;

export const createConversationBodySchema = z.object({
  propertyId: uuid,
  guestId: uuid.nullable().optional(),
  bookingId: uuid.nullable().optional(),
  subject: z.string().max(255).nullable().optional(),
  channel: z
    .enum([
      "talos_direct",
      "whatsapp",
      "email",
      "booking_com",
      "airbnb",
      "expedia",
      "other",
    ])
    .optional(),
});

export const sendOperatorMessageBodySchema = z.object({
  body: z.string().min(1).max(8000),
  aiSuggestionId: uuid.nullable().optional(),
  suggestionStatus: z
    .enum([
      "pending",
      "ready",
      "accepted",
      "edited",
      "rejected",
      "failed",
      "auto_sent",
    ])
    .optional(),
});

const assistantStaySchema = z.object({
  guestDisplayName: z.string().max(255).nullable().optional(),
  guestFirstName: z.string().max(128).nullable().optional(),
  checkIn: z.union([z.string().max(64), z.null()]).optional(),
  checkOut: z.union([z.string().max(64), z.null()]).optional(),
  guestCount: z.number().int().min(1).max(100).nullable().optional(),
  bookingStatus: z.string().max(64).nullable().optional(),
});

const assistantAmenitySchema = z.object({
  id: uuid,
  name: z.string().min(1).max(100),
});

export const ingestGuestMessageBodySchema = z.object({
  body: z.string().min(1).max(8000),
  externalMessageId: z.string().max(255).nullable().optional(),
  stay: assistantStaySchema.nullable().optional(),
  /** Optional override; API loads Property amenities server-side when omitted. */
  amenities: z.array(assistantAmenitySchema).max(200).optional(),
});

export const upsertAssistantProfileBodySchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["off", "copilot", "autopilot"]).optional(),
  tone: z
    .enum(["warm", "professional", "friendly", "luxury", "concise"])
    .optional(),
  formality: z.enum(["informal", "neutral", "formal"]).optional(),
  emojiPolicy: z.enum(["none", "sparing", "allowed"]).optional(),
  useGuestFirstName: z.boolean().optional(),
  replyLength: z.enum(["short", "medium"]).optional(),
  signOff: z.string().max(120).nullable().optional(),
  preferGuestLanguage: z.boolean().optional(),
  defaultLocale: z.string().max(16).optional(),
  customVoiceNotes: z.string().max(500).nullable().optional(),
});

const knowledgeField = z.string().max(8000).nullable().optional();

/** Partial patch matching PropertyGuestKnowledge content fields. */
export const upsertGuestKnowledgeBodySchema = z.object({
  guestFacingSummary: knowledgeField,
  earlyCheckInPolicy: knowledgeField,
  lateCheckoutPolicy: knowledgeField,
  directions: knowledgeField,
  parkingInfo: knowledgeField,
  accessInstructions: knowledgeField,
  wifiSsid: z.string().max(255).nullable().optional(),
  wifiPassword: z.string().max(255).nullable().optional(),
  poolInfo: knowledgeField,
  hvacInstructions: knowledgeField,
  applianceNotes: knowledgeField,
  amenityNotes: knowledgeField,
  houseRules: knowledgeField,
  smokingPolicy: knowledgeField,
  petsPolicy: knowledgeField,
  quietHours: knowledgeField,
  transportInfo: knowledgeField,
  taxiInfo: knowledgeField,
  beaches: knowledgeField,
  restaurants: knowledgeField,
  supermarkets: knowledgeField,
  recommendations: knowledgeField,
  guestFacingPhone: z.string().max(50).nullable().optional(),
  guestFacingEmail: z.string().email().nullable().optional(),
  emergencyContact: knowledgeField,
});

export const replaceFaqsBodySchema = z.object({
  faqs: z
    .array(
      z.object({
        id: uuid.optional(),
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(4000),
        sortOrder: z.number().int().min(0).max(999).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .max(50),
});

export const resolveEscalationBodySchema = z.object({
  ownerReply: z.string().min(1).max(8000),
  send: z.boolean().optional(),
  stay: assistantStaySchema.nullable().optional(),
  amenities: z.array(assistantAmenitySchema).max(200).optional(),
});

export const saveEscalationKnowledgeBodySchema = z.object({
  confirm: z.literal(true),
  patch: upsertGuestKnowledgeBodySchema,
});
