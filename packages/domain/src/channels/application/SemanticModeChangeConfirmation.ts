import type { FeedSemanticMode } from "../types/FeedSemanticMode";

/**
 * Explicit operator confirmation for a semantic-mode transition (CM-4b S2).
 * Application-layer only — not stored on ChannelConnection.
 * Non-secret; suitable for later API/UI confirmation tokens.
 */
export interface SemanticModeChangeConfirmation {
  /** Caller affirms intentional transition. */
  confirmed: true;
  /** Previous mode the caller believes they are leaving. */
  acknowledgedFromMode: FeedSemanticMode;
  /** Target mode the caller believes they are selecting. */
  acknowledgedToMode: FeedSemanticMode;
}

export function isValidSemanticModeChangeConfirmation(
  confirmation: SemanticModeChangeConfirmation | null | undefined,
  expectedFrom: FeedSemanticMode,
  expectedTo: FeedSemanticMode,
): boolean {
  if (confirmation == null) {
    return false;
  }
  return (
    confirmation.confirmed === true &&
    confirmation.acknowledgedFromMode === expectedFrom &&
    confirmation.acknowledgedToMode === expectedTo
  );
}
