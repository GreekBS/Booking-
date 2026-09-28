import { describe, expect, it } from "vitest";
import {
  HeuristicAssistantProvider,
  assertGroundedAnswerable,
  shouldAutoSend,
  buildAssistantContext,
  type PropertyAssistantProfileRecord,
  type PropertyGuestKnowledgeRecord,
} from "../../src/messaging";

const now = new Date();

const profile: PropertyAssistantProfileRecord = {
  id: "p1",
  tenantId: "t1",
  propertyId: "prop1",
  enabled: true,
  mode: "autopilot",
  tone: "warm",
  formality: "neutral",
  emojiPolicy: "sparing",
  useGuestFirstName: true,
  replyLength: "medium",
  signOff: null,
  preferGuestLanguage: true,
  defaultLocale: "el",
  customVoiceNotes: null,
  createdAt: now,
  updatedAt: now,
};

const knowledge: PropertyGuestKnowledgeRecord = {
  id: "k1",
  tenantId: "t1",
  propertyId: "prop1",
  guestFacingSummary: null,
  earlyCheckInPolicy:
    "Early arrival before 15:00 requires owner approval.",
  lateCheckoutPolicy: null,
  directions: null,
  parkingInfo: null,
  accessInstructions: null,
  wifiSsid: "TalosGuest",
  wifiPassword: "demo-wifi-123",
  poolInfo: null,
  hvacInstructions: null,
  applianceNotes: null,
  amenityNotes: null,
  houseRules: null,
  smokingPolicy: null,
  petsPolicy: null,
  quietHours: null,
  transportInfo: null,
  taxiInfo: null,
  beaches: null,
  restaurants: null,
  supermarkets: null,
  recommendations: null,
  guestFacingPhone: null,
  guestFacingEmail: null,
  emergencyContact: null,
  createdAt: now,
  updatedAt: now,
};

function ctx(k: PropertyGuestKnowledgeRecord | null = knowledge) {
  return buildAssistantContext({
    property: {
      id: "prop1",
      name: "Demo Villa",
      type: "villa",
      description: null,
      checkInTime: "15:00",
      checkOutTime: "11:00",
      addressLine: null,
      city: "Athens",
      region: null,
      postalCode: null,
      country: "GR",
    },
    profile,
    knowledge: k,
    faqs: [],
    amenities: [],
    stay: {
      guestDisplayName: "Alex Guest",
      guestFirstName: "Alex",
      checkIn: "2026-06-01",
      checkOut: "2026-06-05",
      guestCount: 2,
      bookingStatus: "confirmed",
    },
    messages: [],
  });
}

describe("AssistantPolicy", () => {
  it("autopilot sends only grounded ANSWERABLE without safety flags", () => {
    expect(
      shouldAutoSend("autopilot", "ANSWERABLE", ["guest_knowledge.wifi_password"], []),
    ).toBe(true);
    expect(shouldAutoSend("copilot", "ANSWERABLE", ["guest_knowledge.wifi_password"], [])).toBe(
      false,
    );
    expect(shouldAutoSend("off", "ANSWERABLE", ["guest_knowledge.wifi_password"], [])).toBe(
      false,
    );
    expect(shouldAutoSend("autopilot", "UNKNOWN", [], [])).toBe(false);
    expect(
      shouldAutoSend("autopilot", "ANSWERABLE", ["guest_knowledge.wifi_password"], ["refund"]),
    ).toBe(false);
    expect(shouldAutoSend("autopilot", "ANSWERABLE", [], [])).toBe(false);
  });

  it("downgrades ungrounded property claims", () => {
    const result = assertGroundedAnswerable({
      classification: "ANSWERABLE",
      replyText: "The wifi password is secret123",
      knowledgeSourceIds: [],
    });
    expect(result.classification).toBe("UNKNOWN");
    expect(result.downgraded).toBe(true);
  });
});

describe("HeuristicAssistantProvider", () => {
  const provider = new HeuristicAssistantProvider();

  it("A: Wi-Fi with knowledge is ANSWERABLE and grounded", async () => {
    const result = await provider.generate({
      context: ctx(),
      inboundMessage: "What is the wifi password?",
      operation: "classify_and_draft",
    });
    expect(result.classification).toBe("ANSWERABLE");
    expect(result.replyText).toMatch(/demo-wifi-123/);
    expect(result.knowledgeSourceIds.length).toBeGreaterThan(0);
    expect(result.requiresEscalation).toBe(false);
    expect(
      shouldAutoSend(
        "autopilot",
        result.classification,
        result.knowledgeSourceIds,
        result.safetyFlags,
      ),
    ).toBe(true);
  });

  it("B: early check-in requiring approval escalates", async () => {
    const result = await provider.generate({
      context: ctx(),
      inboundMessage: "Can I arrive at 12:00?",
      operation: "classify_and_draft",
    });
    expect(result.classification).toBe("REQUIRES_OWNER_DECISION");
    expect(result.requiresEscalation).toBe(true);
    expect(
      shouldAutoSend(
        "autopilot",
        result.classification,
        result.knowledgeSourceIds,
        result.safetyFlags,
      ),
    ).toBe(false);
  });

  it("C: unknown property fact does not hallucinate", async () => {
    const result = await provider.generate({
      context: ctx({ ...knowledge, wifiSsid: null, wifiPassword: null }),
      inboundMessage: "Is there a rooftop jacuzzi with champagne service?",
      operation: "classify_and_draft",
    });
    expect(result.classification).toBe("UNKNOWN");
    expect(result.replyText).toBeNull();
    expect(result.requiresEscalation).toBe(true);
  });

  it("owner polish converts natural language without mutating knowledge semantics", async () => {
    const result = await provider.generate({
      context: ctx(),
      inboundMessage: "Can I arrive at 12:00?",
      operation: "polish_owner_decision",
      ownerRawReply: "Ναι, πες του ότι μπορεί.",
    });
    expect(result.classification).toBe("ANSWERABLE");
    expect(result.replyText).toBeTruthy();
    expect(result.replyText).not.toMatch(/πες του/);
  });
});
