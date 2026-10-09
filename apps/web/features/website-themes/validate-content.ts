import {
  safeParseWebsiteDraftContent,
  type WebsiteDraftContent,
} from "@hcp/validators";

export type ContentValidationResult =
  | { ok: true; content: WebsiteDraftContent }
  | { ok: false; message: string; issues: unknown };

/**
 * Re-validate draft content at the render boundary using Zod v1 contracts.
 * Never trusts client-shaped objects without parsing.
 */
export function validateWebsiteRenderContent(
  input: unknown,
): ContentValidationResult {
  const parsed = safeParseWebsiteDraftContent(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Website content failed schema validation.",
      issues: parsed.error.flatten(),
    };
  }
  return { ok: true, content: parsed.data };
}
