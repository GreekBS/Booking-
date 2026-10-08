/**
 * Conservative deterministic intent for Operator Copilot turns.
 *
 * Only clearly non-operational chitchat may take the no-tool fast path.
 * Anything operational, mixed, or ambiguous MUST keep tools enabled.
 *
 * This classifier never grants data access by itself — it only decides whether
 * Gemini may be offered tool declarations for the turn.
 */

export type OperatorCopilotTurnIntent = "conversational" | "tools";

/** Reject long messages even if they start like a greeting. */
const MAX_CONVERSATIONAL_CHARS = 64;

/**
 * Whole-message allowlist after normalization (accents stripped, lowercased).
 * Keep this narrow — prefer false negatives (tools on) over false positives.
 */
const CONVERSATIONAL_ALLOWLIST = new Set<string>([
  // Greetings (EL / EN)
  // Greetings (EL / EN) — accent-stripped forms only (see normalize)
  "γεια",
  "γεια σου",
  "γεια σας",
  "χαιρετε",
  "χαιρετω",
  "καλημερα",
  "καλησπερα",
  "καληνυχτα",
  "hello",
  "hello there",
  "hi",
  "hi there",
  "hey",
  "hey there",
  "good morning",
  "good afternoon",
  "good evening",
  "good night",
  // Greeting + assistant name
  "γεια talia",
  "γεια σου talia",
  "γεια σας talia",
  "καλημερα talia",
  "καλησπερα talia",
  "hello talia",
  "hi talia",
  "hey talia",
  "talia γεια",
  "talia γεια σου",
  "talia hello",
  "talia hi",
  // Thanks
  "ευχαριστω",
  "ευχαριστω πολυ",
  "σε ευχαριστω",
  "σε ευχαριστω πολυ",
  "ευχαριστω talia",
  "thanks",
  "thanks a lot",
  "thanks talia",
  "thank you",
  "thank you very much",
  "thank you talia",
  "thx",
  "ty",
  // Identity
  "ποια εισαι",
  "ποιος εισαι",
  "τι εισαι",
  "ποια εισαι εσυ",
  "ποιος εισαι εσυ",
  "ποια εισαι talia",
  "ποια ειναι η talia",
  "τι ειναι η talia",
  "who are you",
  "what are you",
  "who is talia",
  "what is talia",
  // Capabilities (general; not property/data questions)
  "τι μπορεις να κανεις",
  "τι ακριβως μπορεις να κανεις",
  "how can you help",
  "how can you help me",
  "what can you do",
  "what do you do",
  "what can talia do",
]);

/**
 * Substrings that indicate operational / data intent.
 * Matched against the normalized message; any hit forces the tools path.
 */
const OPERATIONAL_SIGNALS: RegExp[] = [
  /\d/, // counts, dates, ids
  // English — \b is reliable for Latin tokens
  /\b(booking|bookings|reservation|reservations)\b/,
  /\b(check[\s-]?in|check[\s-]?out)\b/,
  /\b(availab|calendar|overview|status|occupancy|revenue|invoice|payment|payments|guest|guests|unit|units|property|properties|task|tasks|escalat|message|messages|inbox|housekeep|dirty|hold|block|rate|rates|price|prices|adr)\b/,
  /\b(how many|how much)\b/,
  /\b(today|tomorrow|tonight)\b/,
  // Greek — no \b (JS word chars are Latin-only); use stems
  /κρατησ/,
  /αφιξ/,
  /αναχωρ/,
  /διαθεσιμο/,
  /ημερολογ/,
  /επισκοπ/,
  /καταστασ/,
  /πληροτ/,
  /εσοδ/,
  /παραστατ/,
  /πληρωμ/,
  /επισκεπτ/,
  /μοναδ/,
  /καταλυμ/,
  /καθαρισ/,
  /καθαριοτ/,
  /εκκρεμ/,
  /εργασι/,
  /μηνυμ/,
  /διανυκτερ/,
  /τιμ[ηες]/,
  /ποσ(ες|α|οι|ο)/,
  /σημερα/,
  /αυριο/,
  /αποψε/,
];

/**
 * Classify the operator's latest message for tool-offering policy.
 * Default is `"tools"` (fail closed on ambiguity).
 */
export function classifyOperatorCopilotTurnIntent(
  message: string,
): OperatorCopilotTurnIntent {
  const normalized = normalizeOperatorCopilotMessage(message);
  if (!normalized) return "tools";
  if (normalized.length > MAX_CONVERSATIONAL_CHARS) return "tools";
  if (hasOperationalSignal(normalized)) return "tools";
  if (CONVERSATIONAL_ALLOWLIST.has(normalized)) return "conversational";
  return "tools";
}

/** Exported for tests — stable normalization used by the classifier. */
export function normalizeOperatorCopilotMessage(message: string): string {
  const collapsed = message
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B']/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F"]/g, "")
    .replace(/[,:;·•|/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return collapsed.replace(/^[.!?…¿¡]+|[.!?…¿¡]+$/g, "").trim();
}

function hasOperationalSignal(normalized: string): boolean {
  return OPERATIONAL_SIGNALS.some((re) => re.test(normalized));
}
