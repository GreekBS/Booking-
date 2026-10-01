/**
 * Shared keyboard-focus ring for operator UI primitives.
 * Prefer focus-visible so mouse clicks do not leave a persistent ring.
 * Ring color derives from --ring (tracks --primary in later phases).
 */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
