import type {
  AssistantGenerateRequest,
  AssistantGenerateResult,
  IAssistantProvider,
} from "../ports/IAssistantProvider";
import type { AssistantClassification } from "../domain/MessagingTypes";

/**
 * Deterministic receptionist for demos/tests and Gemini-unavailable fallback.
 * Grounds answers only in provided context — never invents Property facts.
 */
export class HeuristicAssistantProvider implements IAssistantProvider {
  async generate(
    req: AssistantGenerateRequest,
  ): Promise<AssistantGenerateResult> {
    const started = Date.now();
    if (req.operation === "polish_owner_decision") {
      return this.polish(req, started);
    }
    return this.classifyAndDraft(req, started);
  }

  private polish(
    req: AssistantGenerateRequest,
    started: number,
  ): AssistantGenerateResult {
    const owner = (req.ownerRawReply ?? "").trim();
    const guestName =
      req.context.style.useGuestFirstName &&
      req.context.stay?.guestFirstName
        ? req.context.stay.guestFirstName
        : req.context.stay?.guestDisplayName?.split(" ")[0] ?? null;
    const greeting = guestName ? `${guestName}, ` : "";
    const lang = detectLanguage(req.inboundMessage);
    let reply: string;
    if (lang === "el") {
      reply = owner.toLowerCase().includes("ναι") || owner.toLowerCase().includes("yes")
        ? `Φυσικά${guestName ? ` ${guestName}` : ""}! Μπορούμε να κανονίσουμε αυτό που ζητήσατε. ${stripOwnerDirective(owner)} Καλό ταξίδι!`
        : `${greeting}${stripOwnerDirective(owner)}`;
    } else {
      reply = /yes|sure|fine|ok|can/i.test(owner)
        ? `Of course${guestName ? `, ${guestName}` : ""}! We'd be happy to arrange that for you. ${stripOwnerDirective(owner)} Have a safe trip!`
        : `${greeting}${stripOwnerDirective(owner)}`;
    }
    if (req.context.style.signOff) {
      reply = `${reply.trim()}\n\n${req.context.style.signOff}`;
    }
    return {
      classification: "ANSWERABLE",
      replyText: reply.trim(),
      requiresEscalation: false,
      escalationReason: null,
      escalationSummary: null,
      unansweredTopics: [],
      knowledgeSourceIds: ["owner_decision"],
      safetyFlags: [],
      guestLanguage: lang,
      provider: "heuristic",
      model: "heuristic-v1",
      inputTokens: null,
      outputTokens: null,
      latencyMs: Date.now() - started,
      success: true,
      errorCode: null,
    };
  }

  private classifyAndDraft(
    req: AssistantGenerateRequest,
    started: number,
  ): AssistantGenerateResult {
    const text = req.inboundMessage.toLowerCase();
    const k = req.context.knowledge;
    const lang = detectLanguage(req.inboundMessage);

    // Forbidden autonomous actions
    if (
      /(refund|cancel.*(booking|reservation)|ακύρωση|επιστροφή χρημάτων|discount|έκπτωση)/i.test(
        text,
      )
    ) {
      return result(started, {
        classification: "BLOCKED",
        replyText: null,
        requiresEscalation: true,
        escalationReason: "sensitive_request",
        escalationSummary: buildEscalationSummary(req, "Ευαίσθητο αίτημα — δεν επιτρέπεται αυτόματη ενέργεια."),
        unansweredTopics: ["sensitive"],
        knowledgeSourceIds: [],
        safetyFlags: ["refund"],
        guestLanguage: lang,
      });
    }

    // Early / late check-in/out decisions
    if (
      /(early\s*check[\s-]*in|arrive\s*(at|before)|check[\s-]*in\s*(at|from)?\s*1[0-4]|νωρίτερα|check[\s-]*in.*(12|13|14)|άφιξη.*(12|13|14))/i.test(
        text,
      )
    ) {
      const policy = k?.earlyCheckInPolicy?.trim();
      const standard = req.context.property.checkInTime;
      if (
        policy &&
        /(approv|confirm|owner|διαχειρισ|έγκρισ|επικοινων)/i.test(policy)
      ) {
        return result(started, {
          classification: "REQUIRES_OWNER_DECISION",
          replyText: null,
          requiresEscalation: true,
          escalationReason: "early_checkin_requires_approval",
          escalationSummary: buildEscalationSummary(
            req,
            `Κανονικό check-in: ${standard}. Πολιτική νωρίτερης άφιξης: ${policy}`,
          ),
          unansweredTopics: ["early_checkin"],
          knowledgeSourceIds: ["guest_knowledge.early_check_in_policy", "policy.check_in_time"],
          safetyFlags: ["early_checkin"],
          guestLanguage: lang,
        });
      }
      if (policy) {
        return result(started, {
          classification: "ANSWERABLE",
          replyText:
            lang === "el"
              ? `Σχετικά με νωρίτερη άφιξη: ${policy}. Το κανονικό check-in είναι στις ${standard}.`
              : `Regarding early arrival: ${policy}. Standard check-in is at ${standard}.`,
          requiresEscalation: false,
          escalationReason: null,
          escalationSummary: null,
          unansweredTopics: [],
          knowledgeSourceIds: [
            "guest_knowledge.early_check_in_policy",
            "policy.check_in_time",
          ],
          safetyFlags: [],
          guestLanguage: lang,
        });
      }
      return result(started, {
        classification: "REQUIRES_OWNER_DECISION",
        replyText: null,
        requiresEscalation: true,
        escalationReason: "early_checkin_no_policy",
        escalationSummary: buildEscalationSummary(
          req,
          `Κανονικό check-in: ${standard}. Δεν υπάρχει πολιτική νωρίτερης άφιξης στη Γνώση AI.`,
        ),
        unansweredTopics: ["early_checkin"],
        knowledgeSourceIds: ["policy.check_in_time"],
        safetyFlags: ["early_checkin"],
        guestLanguage: lang,
      });
    }

    // Wi-Fi
    if (/(wifi|wi[\s-]*fi|password|κωδικό|κωδικος|ιντερνετ)/i.test(text)) {
      if (k?.wifiSsid || k?.wifiPassword) {
        const parts: string[] = [];
        if (k.wifiSsid) parts.push(lang === "el" ? `Δίκτυο: ${k.wifiSsid}` : `Network: ${k.wifiSsid}`);
        if (k.wifiPassword)
          parts.push(lang === "el" ? `Κωδικός: ${k.wifiPassword}` : `Password: ${k.wifiPassword}`);
        return result(started, {
          classification: "ANSWERABLE",
          replyText:
            lang === "el"
              ? `Φυσικά! Στοιχεία Wi‑Fi:\n${parts.join("\n")}`
              : `Of course! Wi‑Fi details:\n${parts.join("\n")}`,
          requiresEscalation: false,
          escalationReason: null,
          escalationSummary: null,
          unansweredTopics: [],
          knowledgeSourceIds: [
            ...(k.wifiSsid ? ["guest_knowledge.wifi_ssid"] : []),
            ...(k.wifiPassword ? ["guest_knowledge.wifi_password"] : []),
          ],
          safetyFlags: [],
          guestLanguage: lang,
        });
      }
      return unknown(started, req, lang, "wifi");
    }

    // Parking
    if (/(park|parking|χώρο στάθμευσης|παρκαρ|στάθμευση)/i.test(text)) {
      if (k?.parkingInfo?.trim()) {
        return result(started, {
          classification: "ANSWERABLE",
          replyText:
            lang === "el"
              ? `Σχετικά με το πάρκινγκ: ${k.parkingInfo}`
              : `Regarding parking: ${k.parkingInfo}`,
          requiresEscalation: false,
          escalationReason: null,
          escalationSummary: null,
          unansweredTopics: [],
          knowledgeSourceIds: ["guest_knowledge.parking_info"],
          safetyFlags: [],
          guestLanguage: lang,
        });
      }
      return unknown(started, req, lang, "parking");
    }

    // Check-in time (informational)
    if (/(check[\s-]*in\s*time|what time.*check[\s-]*in|ώρα.*check[\s-]*in|πότε.*check[\s-]*in)/i.test(text)) {
      return result(started, {
        classification: "ANSWERABLE",
        replyText:
          lang === "el"
            ? `Το check-in ξεκινά στις ${req.context.property.checkInTime}.`
            : `Check-in starts at ${req.context.property.checkInTime}.`,
        requiresEscalation: false,
        escalationReason: null,
        escalationSummary: null,
        unansweredTopics: [],
        knowledgeSourceIds: ["policy.check_in_time"],
        safetyFlags: [],
        guestLanguage: lang,
      });
    }

    // FAQ match (simple contains)
    for (const faq of req.context.faqs) {
      const q = faq.question.toLowerCase();
      const overlap = q
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && text.includes(w));
      if (overlap.length >= 2 || text.includes(q.slice(0, 20))) {
        return result(started, {
          classification: "ANSWERABLE",
          replyText: faq.answer,
          requiresEscalation: false,
          escalationReason: null,
          escalationSummary: null,
          unansweredTopics: [],
          knowledgeSourceIds: [`faq:${faq.id}`],
          safetyFlags: [],
          guestLanguage: lang,
        });
      }
    }

    return unknown(started, req, lang, "general");
  }
}

function unknown(
  started: number,
  req: AssistantGenerateRequest,
  lang: string,
  topic: string,
): AssistantGenerateResult {
  return result(started, {
    classification: "UNKNOWN",
    replyText: null,
    requiresEscalation: true,
    escalationReason: `missing_knowledge:${topic}`,
    escalationSummary: buildEscalationSummary(
      req,
      "Δεν υπάρχει επαρκής πληροφορία στη Γνώση AI για ασφαλή απάντηση.",
    ),
    unansweredTopics: [topic],
    knowledgeSourceIds: [],
    safetyFlags: [],
    guestLanguage: lang,
  });
}

function result(
  started: number,
  partial: {
    classification: AssistantClassification;
    replyText: string | null;
    requiresEscalation: boolean;
    escalationReason: string | null;
    escalationSummary: string | null;
    unansweredTopics: string[];
    knowledgeSourceIds: string[];
    safetyFlags: string[];
    guestLanguage: string | null;
  },
): AssistantGenerateResult {
  return {
    ...partial,
    provider: "heuristic",
    model: "heuristic-v1",
    inputTokens: null,
    outputTokens: null,
    latencyMs: Date.now() - started,
    success: true,
    errorCode: null,
  };
}

function buildEscalationSummary(
  req: AssistantGenerateRequest,
  note: string,
): string {
  const guest =
    req.context.stay?.guestDisplayName ??
    req.context.stay?.guestFirstName ??
    "Επισκέπτης";
  const stay =
    req.context.stay?.checkIn && req.context.stay?.checkOut
      ? `κράτηση ${req.context.stay.checkIn}–${req.context.stay.checkOut}`
      : "χωρίς συνδεδεμένη κράτηση";
  return `Ο επισκέπτης ${guest}, ${stay}, ρώτησε: «${req.inboundMessage.slice(0, 200)}». ${note} Χρειάζεται απάντηση.`;
}

function detectLanguage(text: string): string {
  return /[Α-Ωα-ωΆ-ώ]/.test(text) ? "el" : "en";
}

function stripOwnerDirective(raw: string): string {
  return raw
    .replace(/^(ναι|yes)[,.]?\s*(πες του ότι|tell (him|them|her) (that )?)/i, "")
    .replace(/πες του ότι\s*/i, "")
    .trim();
}
