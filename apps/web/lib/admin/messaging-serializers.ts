/** ISO serializers for messaging + assistant API responses. */

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function serializeConversation(c: {
  id: string;
  tenantId: string;
  propertyId: string;
  guestId: string | null;
  bookingId: string | null;
  channel: string;
  externalThreadId: string | null;
  guestChannelIdentity?: string | null;
  cswOpenUntil?: Date | null;
  lastGuestInboundAt?: Date | null;
  routingStatus?: string;
  status: string;
  subject: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    propertyId: c.propertyId,
    guestId: c.guestId,
    bookingId: c.bookingId,
    channel: c.channel,
    externalThreadId: c.externalThreadId,
    guestChannelIdentity: c.guestChannelIdentity ?? null,
    cswOpenUntil: iso(c.cswOpenUntil),
    lastGuestInboundAt: iso(c.lastGuestInboundAt),
    routingStatus: c.routingStatus ?? "ok",
    status: c.status,
    subject: c.subject,
    lastMessageAt: iso(c.lastMessageAt),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function serializeMessage(m: {
  id: string;
  tenantId: string;
  propertyId: string;
  conversationId: string;
  direction: string;
  senderType: string;
  body: string;
  deliveryStatus: string;
  externalMessageId: string | null;
  createdByUserId: string | null;
  aiSuggestionId: string | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    tenantId: m.tenantId,
    propertyId: m.propertyId,
    conversationId: m.conversationId,
    direction: m.direction,
    senderType: m.senderType,
    body: m.body,
    deliveryStatus: m.deliveryStatus,
    externalMessageId: m.externalMessageId,
    createdByUserId: m.createdByUserId,
    aiSuggestionId: m.aiSuggestionId,
    createdAt: m.createdAt.toISOString(),
  };
}

export function serializeSuggestion(s: {
  id: string;
  tenantId: string;
  propertyId: string;
  conversationId: string;
  sourceMessageId: string | null;
  provider: string;
  model: string;
  classification: string;
  status: string;
  suggestedBody: string | null;
  escalationReason: string | null;
  escalationSummary: string | null;
  knowledgeSourceIds: string[];
  safetyFlags: string[];
  guestLanguage: string | null;
  contextFingerprint: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: s.id,
    tenantId: s.tenantId,
    propertyId: s.propertyId,
    conversationId: s.conversationId,
    sourceMessageId: s.sourceMessageId,
    provider: s.provider,
    model: s.model,
    classification: s.classification,
    status: s.status,
    suggestedBody: s.suggestedBody,
    escalationReason: s.escalationReason,
    escalationSummary: s.escalationSummary,
    knowledgeSourceIds: s.knowledgeSourceIds,
    safetyFlags: s.safetyFlags,
    guestLanguage: s.guestLanguage,
    contextFingerprint: s.contextFingerprint,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function serializeEscalation(e: {
  id: string;
  tenantId: string;
  propertyId: string;
  conversationId: string;
  triggerMessageId: string;
  bookingId: string | null;
  guestId: string | null;
  classification: string;
  reason: string | null;
  summaryForOwner: string;
  status: string;
  ownerRawReply: string | null;
  answeredByUserId: string | null;
  answeredAt: Date | null;
  resultingSuggestionId: string | null;
  resultingMessageId: string | null;
  saveToKnowledgeOffered: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: e.id,
    tenantId: e.tenantId,
    propertyId: e.propertyId,
    conversationId: e.conversationId,
    triggerMessageId: e.triggerMessageId,
    bookingId: e.bookingId,
    guestId: e.guestId,
    classification: e.classification,
    reason: e.reason,
    summaryForOwner: e.summaryForOwner,
    status: e.status,
    ownerRawReply: e.ownerRawReply,
    answeredByUserId: e.answeredByUserId,
    answeredAt: iso(e.answeredAt),
    resultingSuggestionId: e.resultingSuggestionId,
    resultingMessageId: e.resultingMessageId,
    saveToKnowledgeOffered: e.saveToKnowledgeOffered,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

export function serializeAssistantProfile(p: {
  id: string;
  tenantId: string;
  propertyId: string;
  enabled: boolean;
  mode: string;
  tone: string;
  formality: string;
  emojiPolicy: string;
  useGuestFirstName: boolean;
  replyLength: string;
  signOff: string | null;
  preferGuestLanguage: boolean;
  defaultLocale: string;
  customVoiceNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: p.id,
    tenantId: p.tenantId,
    propertyId: p.propertyId,
    enabled: p.enabled,
    mode: p.mode,
    tone: p.tone,
    formality: p.formality,
    emojiPolicy: p.emojiPolicy,
    useGuestFirstName: p.useGuestFirstName,
    replyLength: p.replyLength,
    signOff: p.signOff,
    preferGuestLanguage: p.preferGuestLanguage,
    defaultLocale: p.defaultLocale,
    customVoiceNotes: p.customVoiceNotes,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeKnowledge(
  k: {
    id: string;
    tenantId: string;
    propertyId: string;
    guestFacingSummary: string | null;
    earlyCheckInPolicy: string | null;
    lateCheckoutPolicy: string | null;
    directions: string | null;
    parkingInfo: string | null;
    accessInstructions: string | null;
    wifiSsid: string | null;
    wifiPassword: string | null;
    poolInfo: string | null;
    hvacInstructions: string | null;
    applianceNotes: string | null;
    amenityNotes: string | null;
    houseRules: string | null;
    smokingPolicy: string | null;
    petsPolicy: string | null;
    quietHours: string | null;
    transportInfo: string | null;
    taxiInfo: string | null;
    beaches: string | null;
    restaurants: string | null;
    supermarkets: string | null;
    recommendations: string | null;
    guestFacingPhone: string | null;
    guestFacingEmail: string | null;
    emergencyContact: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null,
) {
  if (!k) return null;
  return {
    id: k.id,
    tenantId: k.tenantId,
    propertyId: k.propertyId,
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
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  };
}

export function serializeFaq(f: {
  id: string;
  tenantId: string;
  propertyId: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: f.id,
    tenantId: f.tenantId,
    propertyId: f.propertyId,
    question: f.question,
    answer: f.answer,
    sortOrder: f.sortOrder,
    isActive: f.isActive,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}
