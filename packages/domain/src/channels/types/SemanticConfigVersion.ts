import { parseSemanticConfigVersion } from "./FeedSemanticMode";

/**
 * Stale-worker / semantic-epoch contract (CM-4b S2).
 *
 * A poll execution classified under semantic version N must not be committed
 * as if it were classified under version N+1.
 *
 * Later polling slices (S9/S12) must load mode+version per execution, stamp
 * observed version into evidence context, and compare before cursor commit.
 */

export interface SemanticConfigVersionToken {
  semanticConfigVersion: number;
}

export function createSemanticConfigVersionToken(
  semanticConfigVersion: number,
): SemanticConfigVersionToken {
  return { semanticConfigVersion: parseSemanticConfigVersion(semanticConfigVersion) };
}

/**
 * Returns true when the connection's current version no longer matches the
 * version observed when the poll/classification started.
 */
export function isStaleSemanticConfigVersion(input: {
  observedVersion: number;
  currentVersion: number;
}): boolean {
  const observed = parseSemanticConfigVersion(input.observedVersion);
  const current = parseSemanticConfigVersion(input.currentVersion);
  return observed !== current;
}

/**
 * Throws when versions diverge — callers should fail/retry rather than mix epochs.
 */
export function assertSemanticConfigVersionCurrent(input: {
  observedVersion: number;
  currentVersion: number;
}): void {
  if (isStaleSemanticConfigVersion(input)) {
    throw new Error(
      `Semantic config version mismatch: observed ${input.observedVersion}, current ${input.currentVersion}. Retry poll under the current semantic epoch.`,
    );
  }
}
