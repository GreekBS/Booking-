"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { PRIMARY_NAV } from "@/lib/marketing/site";
import { MarketingButton } from "./MarketingButton";
import { useMarketingFunnel } from "./MarketingFunnelProvider";

export function MarketingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { openAuth, authOpen, getStartedOpen } = useMarketingFunnel();
  const panelId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  useEffect(() => {
    // Body lock for mobile menu only; Radix Dialog handles lock when overlays are open.
    if (authOpen || getStartedOpen) return;
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen, authOpen, getStartedOpen]);

  function handleOpenAuth() {
    setMenuOpen(false);
    openAuth();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--talos-line)] bg-[color-mix(in_srgb,var(--talos-paper)_92%,transparent)] backdrop-blur-md">
      <div className="talos-container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="talos-display text-2xl font-semibold tracking-tight text-[var(--talos-ink)]"
          aria-label="Talos home"
        >
          TALOS
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-[var(--talos-ink-soft)] transition-colors hover:text-[var(--talos-ink)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={handleOpenAuth}
            data-testid="marketing-sign-in-desktop"
            className="text-sm font-medium text-[var(--talos-ink-soft)] hover:text-[var(--talos-ink)]"
          >
            Sign in
          </button>
          <MarketingButton href="/get-started?source=homepage_nav">
            Get started
          </MarketingButton>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-[var(--talos-line)] lg:hidden"
          aria-expanded={menuOpen}
          aria-controls={panelId}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <span aria-hidden className="flex w-4 flex-col gap-1.5">
            <span className="block h-px bg-[var(--talos-ink)]" />
            <span className="block h-px bg-[var(--talos-ink)]" />
            <span className="block h-px bg-[var(--talos-ink)]" />
          </span>
        </button>
      </div>

      {menuOpen ? (
        <div
          id={panelId}
          className="border-t border-[var(--talos-line)] bg-[var(--talos-paper)] lg:hidden"
        >
          <nav className="talos-container flex flex-col gap-1 py-4" aria-label="Mobile">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-sm px-2 py-3 text-base font-medium text-[var(--talos-ink)]"
                onClick={() => setMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-[var(--talos-line)] pt-4">
              <button
                type="button"
                className="rounded-sm px-2 py-3 text-left text-base font-medium"
                data-testid="marketing-sign-in-mobile"
                onClick={handleOpenAuth}
              >
                Sign in
              </button>
              <MarketingButton
                href="/get-started?source=homepage_nav"
                className="w-full"
              >
                Get started
              </MarketingButton>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
