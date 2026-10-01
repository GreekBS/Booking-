/**
 * Admin shell content spacing contract.
 * Immersive / full-bleed regions must cancel padding with SHELL_CONTENT_BLEED*
 * so negative margins always match AdminShell <main> padding.
 * Do not change this scale in UI-0 beyond aligning bleed ↔ pad.
 */
export const SHELL_CONTENT_PAD = "p-4 md:p-5 lg:p-6";

/** Cancels SHELL_CONTENT_PAD on all sides (immersive calendar). */
export const SHELL_CONTENT_BLEED = "-m-4 md:-m-5 lg:-m-6";

/**
 * Horizontal bleed + restore padding (sticky toolbars that span the main column).
 */
export const SHELL_CONTENT_BLEED_X =
  "-mx-4 px-4 md:-mx-5 md:px-5 lg:-mx-6 lg:px-6";
