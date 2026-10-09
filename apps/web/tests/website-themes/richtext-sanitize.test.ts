/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import {
  richtextSanitizerImplementsContract,
  sanitizeRichtextToPlainText,
  sanitizeRichtextToReact,
} from "@/features/website-themes";

describe("website richtext sanitizer", () => {
  it("implements the validators sanitization contract", () => {
    expect(richtextSanitizerImplementsContract()).toBe(true);
  });

  it("strips script tags and keeps surrounding text", () => {
    const text = sanitizeRichtextToPlainText(
      '<p>Hello</p><script>alert("xss")</script><p>World</p>',
    );
    expect(text).toContain("Hello");
    expect(text).toContain("World");
    expect(text.toLowerCase()).not.toContain("alert");
    expect(text.toLowerCase()).not.toContain("script");
  });

  it("removes javascript: and data: links", () => {
    const node = sanitizeRichtextToReact(
      '<a href="javascript:alert(1)">Click</a><a href="https://example.com">Safe</a><a href="data:text/html,x">Data</a>',
    );
    render(createElement("div", null, node));
    expect(screen.queryByRole("link", { name: "Click" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Data" })).toBeNull();
    const safe = screen.getByRole("link", { name: "Safe" });
    expect(safe.getAttribute("href")).toBe("https://example.com");
  });

  it("allows root-relative https-safe links", () => {
    const node = sanitizeRichtextToReact('<a href="/book">Book</a>');
    render(createElement("div", null, node));
    expect(screen.getByRole("link", { name: "Book" }).getAttribute("href")).toBe(
      "/book",
    );
  });

  it("strips event-handler attributes by rebuilding elements", () => {
    const node = sanitizeRichtextToReact(
      '<p onclick="alert(1)" onmouseover="alert(2)">Stay</p>',
    );
    const { container } = render(createElement("div", null, node));
    expect(container.innerHTML.toLowerCase()).not.toContain("onclick");
    expect(container.innerHTML.toLowerCase()).not.toContain("onmouseover");
    expect(container.textContent).toContain("Stay");
  });

  it("handles encoded and malformed payloads without executing markup", () => {
    const payloads = [
      '<img src=x onerror="alert(1)">',
      "<svg><script>alert(1)</script></svg>",
      '<<script>script>alert(1)<</script>/script>',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<iframe src="https://evil.test"></iframe>ok',
      '<form action="https://evil.test"><input></form>',
    ];
    for (const payload of payloads) {
      const { container } = render(
        createElement("div", null, sanitizeRichtextToReact(payload)),
      );
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector("form")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(container.innerHTML.toLowerCase()).not.toContain("onerror=");
    }
  });

  it("never returns a raw HTML string that browsers would parse as markup when rendered as text child", () => {
    const node = sanitizeRichtextToReact("<script>alert(1)</script>Safe");
    // React text children are escaped — assert we did not keep a script element tree.
    const { container } = render(createElement("div", null, node));
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Safe");
  });
});
