import {
  createElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { WEBSITE_RICHTEXT_SANITIZATION_CONTRACT } from "@hcp/validators";

/**
 * Render-boundary richtext sanitizer (implements WEBSITE_RICHTEXT_SANITIZATION_CONTRACT).
 *
 * Never returns raw HTML strings for DOM injection. Output is plain text or
 * React elements built from an allowlisted tag set after DOM parsing.
 */

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "h2",
  "h3",
  "h4",
  "blockquote",
]);

const FORBIDDEN_TAGS = new Set(
  WEBSITE_RICHTEXT_SANITIZATION_CONTRACT.forbiddenTags.map((t) =>
    t.toLowerCase(),
  ),
);

function isSafeHref(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  const lower = v.toLowerCase();
  for (const scheme of WEBSITE_RICHTEXT_SANITIZATION_CONTRACT.forbiddenUrlSchemes) {
    if (lower.startsWith(scheme)) return false;
  }
  if (
    WEBSITE_RICHTEXT_SANITIZATION_CONTRACT.allowRootRelativeUrls &&
    v.startsWith("/") &&
    !v.startsWith("//")
  ) {
    return true;
  }
  try {
    const u = new URL(v);
    return WEBSITE_RICHTEXT_SANITIZATION_CONTRACT.allowedUrlSchemes.includes(
      u.protocol as "http:" | "https:" | "mailto:",
    );
  } catch {
    return false;
  }
}

function stripControlChars(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/**
 * Escape HTML special characters for safe text display when DOM parsing is
 * unavailable or content has no markup.
 */
export function escapeHtmlText(input: string): string {
  return stripControlChars(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function looksLikeHtml(input: string): boolean {
  return /<[a-zA-Z!/?]/.test(input);
}

type DomLikeDocument = {
  body: { childNodes: ArrayLike<DomLikeNode> };
};

type DomLikeNode = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomLikeNode>;
  getAttribute?: (name: string) => string | null;
};

function parseHtmlFragment(html: string): DomLikeDocument | null {
  const DOMParserCtor = (
    globalThis as unknown as {
      DOMParser?: new () => {
        parseFromString: (s: string, t: string) => DomLikeDocument;
      };
    }
  ).DOMParser;
  if (!DOMParserCtor) return null;
  try {
    const doc = new DOMParserCtor().parseFromString(
      `<div id="rt-root">${html}</div>`,
      "text/html",
    );
    return doc;
  } catch {
    return null;
  }
}

function findRoot(doc: DomLikeDocument): DomLikeNode | null {
  const body = doc.body;
  if (!body) return null;
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (
      node &&
      node.nodeType === 1 &&
      node.nodeName.toLowerCase() === "div"
    ) {
      return node;
    }
  }
  return body as unknown as DomLikeNode;
}

function walk(node: DomLikeNode, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child) continue;
    const key = `${keyPrefix}.${i}`;
    if (child.nodeType === 3) {
      // Text
      const text = child.textContent ?? "";
      if (text) out.push(text);
      continue;
    }
    if (child.nodeType !== 1) continue;

    const tag = child.nodeName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag) || tag === "script" || tag === "style") {
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      // Unwrap unknown/disallowed tags — keep text children only.
      out.push(...walk(child, key));
      continue;
    }

    if (tag === "br") {
      out.push(createElement("br", { key }));
      continue;
    }

    const kids = walk(child, key);
    if (tag === "a") {
      const href = child.getAttribute?.("href") ?? "";
      if (!isSafeHref(href)) {
        out.push(...kids);
        continue;
      }
      out.push(
        createElement(
          "a",
          {
            key,
            href: href.trim(),
            rel: "noopener noreferrer",
            target: "_blank",
          },
          ...kids,
        ),
      );
      continue;
    }

    const reactTag = tag === "b" ? "strong" : tag === "i" ? "em" : tag;
    out.push(createElement(reactTag, { key }, ...kids));
  }
  return out;
}

/**
 * Sanitize untrusted richtext into React nodes (never raw HTML injection).
 */
export function sanitizeRichtextToReact(input: unknown): ReactNode {
  if (input == null) return null;
  const raw = stripControlChars(String(input));
  if (!raw.trim()) return null;

  if (!looksLikeHtml(raw)) {
    // Plain text: preserve paragraphs by blank lines.
    const parts = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length <= 1) {
      return raw;
    }
    return parts.map((p, i) =>
      createElement("p", { key: `p-${i}` }, p.replace(/\n/g, " ")),
    );
  }

  const doc = parseHtmlFragment(raw);
  if (!doc) {
    // No DOMParser — fail closed to escaped plain text as a single string
    // (callers render as text children, not HTML).
    return raw.replace(/<[^>]*>/g, "");
  }

  const root = findRoot(doc);
  if (!root) return raw.replace(/<[^>]*>/g, "");

  const nodes = walk(root, "rt");
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return createElement("div", { className: "wb-richtext" }, ...nodes);
}

/**
 * Plain-text extraction for tests / meta — scripts and tags removed.
 */
export function sanitizeRichtextToPlainText(input: unknown): string {
  const node = sanitizeRichtextToReact(input);
  return flattenText(node).trim();
}

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (typeof node === "object" && "props" in (node as ReactElement)) {
    const el = node as ReactElement<{ children?: ReactNode }>;
    return flattenText(el.props.children);
  }
  return "";
}

/** Assert contract wiring for fitness tests. */
export function richtextSanitizerImplementsContract(): boolean {
  return (
    WEBSITE_RICHTEXT_SANITIZATION_CONTRACT.status ===
      "deferred_to_render_boundary" &&
    FORBIDDEN_TAGS.has("script") &&
    ALLOWED_TAGS.has("p")
  );
}
