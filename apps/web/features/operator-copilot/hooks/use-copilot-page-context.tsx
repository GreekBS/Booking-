"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  derivePageContext,
  type CopilotPageContext,
  type CopilotPageContextHints,
} from "../lib/page-context";

interface PublisherValue {
  hints: CopilotPageContextHints | null;
  setPageContextHints: (hints: CopilotPageContextHints | null) => void;
}

const CopilotPageContextPublisher = createContext<PublisherValue | null>(null);

/**
 * Optional: lets a page publish richer hints (e.g. the open booking id or the
 * visible calendar range). Hints are cleared automatically on navigation.
 */
export function CopilotPageContextProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<{
    pathname: string | null;
    hints: CopilotPageContextHints | null;
  }>({ pathname: null, hints: null });

  const setPageContextHints = useCallback(
    (hints: CopilotPageContextHints | null) => {
      setState({ pathname, hints });
    },
    [pathname],
  );

  // Hints belong to the page that published them.
  useEffect(() => {
    setState((prev) => (prev.pathname === pathname ? prev : { pathname, hints: null }));
  }, [pathname]);

  const value = useMemo<PublisherValue>(
    () => ({
      hints: state.pathname === pathname ? state.hints : null,
      setPageContextHints,
    }),
    [state, pathname, setPageContextHints],
  );

  return (
    <CopilotPageContextPublisher.Provider value={value}>
      {children}
    </CopilotPageContextPublisher.Provider>
  );
}

/** Pathname-derived context merged with any published hints. Safe without a provider. */
export function useCopilotPageContext(): CopilotPageContext {
  const pathname = usePathname();
  const publisher = useContext(CopilotPageContextPublisher);
  const hints = publisher?.hints ?? null;
  return useMemo(() => derivePageContext(pathname, hints), [pathname, hints]);
}

/** Page-side publisher. No-op outside the provider. */
export function useSetCopilotPageContextHints(): (
  hints: CopilotPageContextHints | null,
) => void {
  const publisher = useContext(CopilotPageContextPublisher);
  return publisher?.setPageContextHints ?? noop;
}

function noop(): void {
  /* provider not mounted */
}
