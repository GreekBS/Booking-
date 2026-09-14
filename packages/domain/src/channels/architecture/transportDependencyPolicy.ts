/**
 * ADR-022 §4.1 transport isolation — dependency allow-list policy.
 * Used by architecture fitness tests and CM-4a+ transport code review.
 */

export const TRANSPORT_SCOPE_RELATIVE_PATHS = [
  "application/ChannelIngressBatchProcessor.ts",
  "application/ChannelIngressConnectionGuard.ts",
  "application/ChannelIngressProvenanceGuard.ts",
  "application/ChannelIngressIdentityValidator.ts",
  "application/ChannelIngressOrchestrationSupport.ts",
  "application/ReceiveChannelWebhookBatchUseCase.ts",
  "application/ReceiveChannelPollBatchUseCase.ts",
  "application/HandleChannelWebhookTransportUseCase.ts",
  "application/ChannelWebhookTransportSupport.ts",
  "application/ExecuteChannelPollConnectionUseCase.ts",
  "application/ChannelPollTransportSupport.ts",
  "jobs/PollChannelConnectionJobHandler.ts",
  "simulation/TestChannel",
  "contract",
] as const;

export const PROVIDER_CONTRACT_SRC_SCOPE_RELATIVE_PATHS = ["src/channels/contract"] as const;

export const PROVIDER_HARNESS_SCOPE_RELATIVE_PATHS = [
  "tests/channels/contract/harness",
  "tests/channels/contract/fixtures",
] as const;

/** CM-4b S2 semantic-mode domain/application files — must not import Commerce/Booking/iCal/Prisma. */
export const SEMANTIC_MODE_SCOPE_RELATIVE_PATHS = [
  "types/FeedSemanticMode.ts",
  "types/FeedSemanticModePolicy.ts",
  "types/ReservationEmissionPolicy.ts",
  "types/SemanticEvidenceStamp.ts",
  "types/SemanticConfigVersion.ts",
  "application/SemanticModeChangeConfirmation.ts",
  "application/SetChannelConnectionSemanticModeUseCase.ts",
] as const;

export const PRODUCTION_DI_FORBIDDEN_IMPORT_PATTERNS: RegExp[] = [
  /InMemoryChannelCredentialResolver/,
  /TestChannelWebhookProvider/,
  /TestChannelPollingProvider/,
  /TestChannelTransportProviderBundle/,
  /createTestChannelTransportProviderRegistration/,
  /createChannelIngressTestStack/,
  /defineCombinedProviderContract/,
  /defineWebhookProviderContract/,
  /definePollingProviderContract/,
  /referenceProviderContractFixture/,
  /createReferenceProviderContractFixture/,
  /channels\/contract\/harness/,
];

/** Imports that must never appear in transport-scoped production code. */
export const FORBIDDEN_TRANSPORT_IMPORT_PATTERNS: RegExp[] = [
  /ImportChannelReservationCreateDryRunUseCase/,
  /ImportChannelReservationCommandUseCase/,
  /PrepareReservationUseCase/,
  /CreateReservationUseCase/,
  /ReservationOrchestrator/,
  /ProcessChannelInboxItemUseCase/,
  /IChannelInboxRepository/,
  /EnqueueJobUseCase/,
  /IBackgroundJobRepository/,
  /IBookingRepository/,
  /IQuoteRepository/,
  /IHoldRepository/,
  /ICalendarBlockRepository/,
  /IExternalReservationLinkRepository/,
  /\/commerce\//,
  /@hcp\/database/,
  /@prisma\/client/,
];

export const FORBIDDEN_SEMANTIC_MODE_IMPORT_PATTERNS: RegExp[] = [
  ...FORBIDDEN_TRANSPORT_IMPORT_PATTERNS,
  /ICalPolling/,
  /IcalParser/,
  /node-fetch/,
  /undici/,
];

/**
 * Non-relative import specifiers allowed in transport-scoped production code.
 * Default-deny: anything not matching is a violation.
 */
export const ALLOWED_TRANSPORT_IMPORT_PATTERNS: RegExp[] = [
  /ReceiveChannelEventUseCase/,
  /ChannelIngressBatchProcessor/,
  /ChannelIngressConnectionGuard/,
  /ChannelIngressProvenanceGuard/,
  /ChannelIngressIdentityValidator/,
  /ChannelIngressOrchestrationSupport/,
  /ReceiveChannelWebhookBatchUseCase/,
  /ReceiveChannelPollBatchUseCase/,
  /HandleChannelWebhookTransportUseCase/,
  /ChannelWebhookTransportSupport/,
  /ExecuteChannelPollConnectionUseCase/,
  /ChannelPollTransportSupport/,
  /PollChannelConnectionJobHandler/,
  /PollChannelConnectionJobTypes/,
  /\/platform\/async\/jobs\//,
  /ChannelProviderRegistry/,
  /IChannelProviderRegistry/,
  /IChannelCredentialResolver/,
  /IChannelPollCursorRepository/,
  /IChannelConnectionRepository/,
  /\/channels\/types\//,
  /\/channels\/ports\/providers\//,
  /\/channels\/ports\/IChannel/,
  /\/channels\/architecture\//,
  /\/channels\/contract\//,
  /\/channels\/domain\//,
  /\/channels\/types$/,
  /\/shared\/kernel\//,
  /\/shared\/errors\//,
  /\/shared\/types\//,
];

/** Imports that must never appear in provider harness or contract certification code. */
export const FORBIDDEN_PROVIDER_HARNESS_IMPORT_PATTERNS: RegExp[] = [
  ...FORBIDDEN_TRANSPORT_IMPORT_PATTERNS,
];

/** Production-safe provider contract types must not depend on test harness code. */
export const FORBIDDEN_PROVIDER_CONTRACT_SRC_PATTERNS: RegExp[] = [
  /vitest/,
  /defineCombinedProviderContract/,
  /defineWebhookProviderContract/,
  /definePollingProviderContract/,
  /\/simulation\/TestChannel/,
  /createChannelIngressTestStack/,
  /referenceProviderContractFixture/,
];

export function findForbiddenProviderHarnessImports(source: string): string[] {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_PROVIDER_HARNESS_IMPORT_PATTERNS) {
    if (pattern.test(source)) {
      violations.push(pattern.source);
    }
  }
  return violations;
}

export function findForbiddenProviderContractSrcImports(source: string): string[] {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_PROVIDER_CONTRACT_SRC_PATTERNS) {
    if (pattern.test(source)) {
      violations.push(pattern.source);
    }
  }
  return violations;
}

export function findForbiddenSemanticModeImports(source: string): string[] {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_SEMANTIC_MODE_IMPORT_PATTERNS) {
    if (pattern.test(source)) {
      violations.push(pattern.source);
    }
  }
  return violations;
}

export function parseImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importFrom = /from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importFrom.exec(source)) !== null) {
    if (match[1]) {
      specifiers.push(match[1]);
    }
  }

  const sideEffect = /import\s+['"]([^'"]+)['"]/g;
  while ((match = sideEffect.exec(source)) !== null) {
    if (match[1]) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

export function findForbiddenTransportImports(source: string): string[] {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_TRANSPORT_IMPORT_PATTERNS) {
    if (pattern.test(source)) {
      violations.push(pattern.source);
    }
  }
  return violations;
}

export function findDisallowedTransportImports(source: string): string[] {
  const violations: string[] = [];
  for (const specifier of parseImportSpecifiers(source)) {
    if (specifier.startsWith(".")) {
      if (FORBIDDEN_TRANSPORT_IMPORT_PATTERNS.some((pattern) => pattern.test(specifier))) {
        violations.push(specifier);
      }
      continue;
    }

    const allowed = ALLOWED_TRANSPORT_IMPORT_PATTERNS.some((pattern) => pattern.test(specifier));
    if (!allowed) {
      violations.push(specifier);
    }
  }
  return violations;
}
