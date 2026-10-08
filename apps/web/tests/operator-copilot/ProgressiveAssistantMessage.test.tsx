/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ProgressiveAssistantMessage,
  PROGRESSIVE_REVEAL_MAX_MS,
} from "@/features/operator-copilot/components/ProgressiveAssistantMessage";

function mockMatchMedia(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ProgressiveAssistantMessage", () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    vi.useFakeTimers();
    mockMatchMedia(false);
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      return setTimeout(() => {
        now += 16;
        cb(now);
      }, 16) as unknown as number;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows full content immediately when animate is false", () => {
    render(
      <ProgressiveAssistantMessage
        id="m1"
        content={"Hello\nworld"}
        animate={false}
      />,
    );
    const bubble = screen.getByTestId("copilot-assistant-message");
    expect(bubble).toHaveAttribute("data-progressive-done", "true");
    expect(bubble.textContent).toBe("Hello\nworld");
    expect(bubble.className).toMatch(/whitespace-pre-wrap/);
  });

  it("reveals text progressively within the max duration", async () => {
    const onRevealComplete = vi.fn();
    render(
      <ProgressiveAssistantMessage
        id="m2"
        content="ABCDEFGHIJ"
        animate
        onRevealComplete={onRevealComplete}
      />,
    );
    const bubble = screen.getByTestId("copilot-assistant-message");
    expect(bubble).toHaveAttribute("data-progressive-done", "false");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROGRESSIVE_REVEAL_MAX_MS / 2);
    });
    expect(bubble).toHaveAttribute("data-progressive-done", "false");
    expect(onRevealComplete).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROGRESSIVE_REVEAL_MAX_MS + 100);
    });
    expect(bubble).toHaveAttribute("data-progressive-done", "true");
    expect(onRevealComplete).toHaveBeenCalledWith("m2");
    expect(bubble).toHaveTextContent("ABCDEFGHIJ");
  });

  it("skips the reveal on click", async () => {
    vi.useRealTimers();
    mockMatchMedia(false);
    const user = userEvent.setup();
    const onRevealComplete = vi.fn();
    render(
      <ProgressiveAssistantMessage
        id="m3"
        content="Skip me please now"
        animate
        onRevealComplete={onRevealComplete}
      />,
    );
    const bubble = screen.getByTestId("copilot-assistant-message");
    expect(bubble).toHaveAttribute("data-progressive-done", "false");
    await user.click(bubble);
    expect(bubble).toHaveAttribute("data-progressive-done", "true");
    expect(bubble).toHaveTextContent("Skip me please now");
    expect(onRevealComplete).toHaveBeenCalledWith("m3");
  });

  it("skips animation when prefers-reduced-motion is set", async () => {
    mockMatchMedia(true);
    const onRevealComplete = vi.fn();
    render(
      <ProgressiveAssistantMessage
        id="m4"
        content="Reduced motion reply"
        animate
        onRevealComplete={onRevealComplete}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const bubble = screen.getByTestId("copilot-assistant-message");
    expect(bubble).toHaveAttribute("data-progressive-done", "true");
    expect(bubble).toHaveTextContent("Reduced motion reply");
    expect(onRevealComplete).toHaveBeenCalledWith("m4");
  });
});
