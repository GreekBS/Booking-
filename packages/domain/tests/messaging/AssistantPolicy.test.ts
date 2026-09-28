import { describe, expect, it } from "vitest";
import {
  assertGroundedAnswerable,
  containsPropertySpecificClaim,
  hasBlockingSafetyFlag,
  shouldAutoSend,
} from "../../src/messaging/application/AssistantPolicy";

const SOURCES = ["knowledge:wifiPassword"];

describe("shouldAutoSend", () => {
  it("auto-sends a grounded ANSWERABLE reply in autopilot", () => {
    expect(shouldAutoSend("autopilot", "ANSWERABLE", SOURCES, [])).toBe(true);
  });

  it("never auto-sends in copilot mode", () => {
    expect(shouldAutoSend("copilot", "ANSWERABLE", SOURCES, [])).toBe(false);
  });

  it("never auto-sends when the assistant is off", () => {
    expect(shouldAutoSend("off", "ANSWERABLE", SOURCES, [])).toBe(false);
  });

  it("refuses non-ANSWERABLE classifications", () => {
    expect(shouldAutoSend("autopilot", "UNKNOWN", SOURCES, [])).toBe(false);
    expect(
      shouldAutoSend("autopilot", "REQUIRES_OWNER_DECISION", SOURCES, []),
    ).toBe(false);
    expect(shouldAutoSend("autopilot", "BLOCKED", SOURCES, [])).toBe(false);
  });

  it("refuses ungrounded answers", () => {
    expect(shouldAutoSend("autopilot", "ANSWERABLE", [], [])).toBe(false);
  });

  it("refuses any safety flag, including unknown ones", () => {
    expect(shouldAutoSend("autopilot", "ANSWERABLE", SOURCES, ["medical"])).toBe(
      false,
    );
    expect(
      shouldAutoSend("autopilot", "ANSWERABLE", SOURCES, ["brand_new_flag"]),
    ).toBe(false);
  });

  it("ignores blank flag entries", () => {
    expect(shouldAutoSend("autopilot", "ANSWERABLE", SOURCES, ["", "  "])).toBe(
      true,
    );
    expect(hasBlockingSafetyFlag(["", " "])).toBe(false);
  });
});

describe("assertGroundedAnswerable", () => {
  it("keeps a sourced ANSWERABLE reply", () => {
    const result = assertGroundedAnswerable({
      classification: "ANSWERABLE",
      replyText: "The Wi-Fi password is talos2026.",
      knowledgeSourceIds: SOURCES,
    });

    expect(result.classification).toBe("ANSWERABLE");
    expect(result.downgraded).toBe(false);
  });

  it("downgrades an unsourced property-specific claim to UNKNOWN", () => {
    const result = assertGroundedAnswerable({
      classification: "ANSWERABLE",
      replyText: "The Wi-Fi password is talos2026.",
      knowledgeSourceIds: [],
    });

    expect(result.classification).toBe("UNKNOWN");
    expect(result.downgraded).toBe(true);
    expect(result.reason).toBe("ungrounded_property_claim");
  });

  it("downgrades unsourced Greek property claims too", () => {
    const result = assertGroundedAnswerable({
      classification: "ANSWERABLE",
      replyText: "Ο κωδικός του wifi είναι talos2026.",
      knowledgeSourceIds: [],
    });

    expect(result.classification).toBe("UNKNOWN");
  });

  it("allows an unsourced generic courtesy reply", () => {
    const result = assertGroundedAnswerable({
      classification: "ANSWERABLE",
      replyText: "Thank you, we are happy to hear that!",
      knowledgeSourceIds: [],
    });

    expect(result.classification).toBe("ANSWERABLE");
    expect(result.downgraded).toBe(false);
  });

  it("never upgrades a non-ANSWERABLE classification", () => {
    const result = assertGroundedAnswerable({
      classification: "BLOCKED",
      replyText: "anything",
      knowledgeSourceIds: SOURCES,
    });

    expect(result.classification).toBe("BLOCKED");
    expect(result.downgraded).toBe(false);
  });
});

describe("containsPropertySpecificClaim", () => {
  it("detects property facts in both languages", () => {
    expect(containsPropertySpecificClaim("Parking is on the street")).toBe(true);
    expect(containsPropertySpecificClaim("Η άφιξη είναι στις 15:00")).toBe(true);
    expect(containsPropertySpecificClaim("Have a nice trip")).toBe(false);
  });
});
