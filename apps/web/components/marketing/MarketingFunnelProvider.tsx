"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LeadSource } from "@hcp/domain";
import { parseLeadSourceParam } from "@/lib/marketing/lead-source";
import { MarketingAuthDialog } from "./MarketingAuthDialog";
import { GetStartedOverlay } from "./GetStartedOverlay";

export type OpenGetStartedOptions = {
  source?: string | LeadSource;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

type MarketingFunnelContextValue = {
  openGetStarted: (options?: OpenGetStartedOptions) => void;
  closeGetStarted: () => void;
  openAuth: () => void;
  closeAuth: () => void;
  getStartedOpen: boolean;
  authOpen: boolean;
};

const MarketingFunnelContext = createContext<MarketingFunnelContextValue | null>(
  null,
);

export function useMarketingFunnel(): MarketingFunnelContextValue {
  const ctx = useContext(MarketingFunnelContext);
  if (!ctx) {
    throw new Error("useMarketingFunnel must be used within MarketingFunnelProvider");
  }
  return ctx;
}

/** Optional hook — returns null when outside marketing funnel (e.g. standalone tests). */
export function useOptionalMarketingFunnel(): MarketingFunnelContextValue | null {
  return useContext(MarketingFunnelContext);
}

type GetStartedState = {
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

/**
 * Coordinates marketing auth + Get Started overlays so they never open together.
 */
export function MarketingFunnelProvider({ children }: { children: ReactNode }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const [getStarted, setGetStarted] = useState<GetStartedState>({
    source: "other",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
  });

  const openGetStarted = useCallback((options?: OpenGetStartedOptions) => {
    setAuthOpen(false);
    setGetStarted({
      source: parseLeadSourceParam(options?.source ?? "other"),
      utmSource: options?.utmSource ?? null,
      utmMedium: options?.utmMedium ?? null,
      utmCampaign: options?.utmCampaign ?? null,
    });
    setGetStartedOpen(true);
  }, []);

  const closeGetStarted = useCallback(() => setGetStartedOpen(false), []);

  const openAuth = useCallback(() => {
    setGetStartedOpen(false);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const value = useMemo(
    () => ({
      openGetStarted,
      closeGetStarted,
      openAuth,
      closeAuth,
      getStartedOpen,
      authOpen,
    }),
    [
      openGetStarted,
      closeGetStarted,
      openAuth,
      closeAuth,
      getStartedOpen,
      authOpen,
    ],
  );

  return (
    <MarketingFunnelContext.Provider value={value}>
      {children}
      <MarketingAuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      <GetStartedOverlay
        open={getStartedOpen}
        onOpenChange={setGetStartedOpen}
        source={getStarted.source}
        utmSource={getStarted.utmSource}
        utmMedium={getStarted.utmMedium}
        utmCampaign={getStarted.utmCampaign}
      />
    </MarketingFunnelContext.Provider>
  );
}
