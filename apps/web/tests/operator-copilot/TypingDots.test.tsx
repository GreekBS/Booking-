/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypingDots } from "@/features/operator-copilot/components/TypingDots";

describe("TypingDots", () => {
  it("exposes the thinking status for assistive tech", () => {
    render(<TypingDots />);
    const status = screen.getByTestId("copilot-thinking");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAccessibleName(/Talia σκέφτεται/);
  });
});
