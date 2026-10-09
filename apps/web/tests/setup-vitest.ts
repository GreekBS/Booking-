import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

vi.mock("next/font/google", () => {
  const fontFactory = () => ({
    className: "mock-font",
    variable: "--font-mock",
    style: { fontFamily: "mock-font" },
  });
  return {
    Fraunces: fontFactory,
    Manrope: fontFactory,
    Cormorant_Garamond: fontFactory,
    Outfit: fontFactory,
    Libre_Baskerville: fontFactory,
    DM_Sans: fontFactory,
  };
});

afterEach(() => {
  cleanup();
});
