import type {
  AssistantClassification,
  AssistantMode,
} from "../domain/MessagingTypes";

/**
 * Safety flags a provider may raise. The list is documentation only — the
 * policy is fail-closed, so *any* raised flag blocks unattended sending,
 * including flags this version does not know about.
 */
export const KNOWN_SAFETY_FLAGS = [
  "self_harm",
  "medical",
  "legal",
  "emergency",
  "payment_request",
  "credential_request",
  "personal_data_request",
  "abuse",
  "prompt_injection",
] as const;
export type KnownSafetyFlag = (typeof KNOWN_SAFETY_FLAGS)[number];

export function hasBlockingSafetyFlag(safetyFlags: readonly string[]): boolean {
  return safetyFlags.some((flag) => flag.trim().length > 0);
}

/**
 * The single gate for unattended replies. All four conditions must hold:
 * autopilot mode, ANSWERABLE verdict, at least one grounding source, and no
 * safety flag. Copilot and off never auto-send.
 */
export function shouldAutoSend(
  mode: AssistantMode,
  classification: AssistantClassification,
  knowledgeSourceIds: readonly string[],
  safetyFlags: readonly string[],
): boolean {
  if (mode !== "autopilot") {
    return false;
  }
  if (classification !== "ANSWERABLE") {
    return false;
  }
  if (knowledgeSourceIds.length === 0) {
    return false;
  }
  return !hasBlockingSafetyFlag(safetyFlags);
}

/**
 * Markers of a property-specific factual claim (English + Greek). A reply
 * containing one of these must cite a knowledge source, otherwise the model is
 * inventing property facts.
 */
const PROPERTY_SPECIFIC_CLAIM_MARKERS = [
  "wifi",
  "wi-fi",
  "password",
  "network name",
  "door code",
  "lockbox",
  "key box",
  "keybox",
  "access code",
  "parking",
  "check-in",
  "check in",
  "checkin",
  "check-out",
  "check out",
  "checkout",
  "address",
  "house rules",
  "quiet hours",
  "pool",
  "air condition",
  "heating",
  "elevator",
  "pet",
  "smoking",
  "wi‑fi",
  "κωδικ",
  "συνθηματ",
  "δίκτυο",
  "παρκιν",
  "πάρκιν",
  "στάθμευση",
  "άφιξη",
  "αναχώρηση",
  "διεύθυνση",
  "κανόνες",
  "κλειδ",
  "πισίνα",
  "κλιματισμ",
  "ασανσέρ",
] as const;

export function containsPropertySpecificClaim(replyText: string): boolean {
  const normalized = replyText.toLowerCase();
  return PROPERTY_SPECIFIC_CLAIM_MARKERS.some((marker) =>
    normalized.includes(marker),
  );
}

export interface GroundingCheckInput {
  classification: AssistantClassification;
  replyText: string;
  knowledgeSourceIds: readonly string[];
}

export interface GroundingCheckResult {
  classification: AssistantClassification;
  downgraded: boolean;
  reason: string | null;
}

/**
 * Post-validation of a provider answer: an ANSWERABLE reply that states a
 * property-specific fact without citing any source is downgraded to UNKNOWN so
 * it reaches the owner instead of the guest. Never upgrades a classification.
 */
export function assertGroundedAnswerable(
  input: GroundingCheckInput,
): GroundingCheckResult {
  if (input.classification !== "ANSWERABLE") {
    return {
      classification: input.classification,
      downgraded: false,
      reason: null,
    };
  }

  if (input.knowledgeSourceIds.length > 0) {
    return { classification: "ANSWERABLE", downgraded: false, reason: null };
  }

  if (!containsPropertySpecificClaim(input.replyText)) {
    return { classification: "ANSWERABLE", downgraded: false, reason: null };
  }

  return {
    classification: "UNKNOWN",
    downgraded: true,
    reason: "ungrounded_property_claim",
  };
}
