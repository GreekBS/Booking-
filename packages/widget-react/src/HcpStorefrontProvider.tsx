import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  createStorefrontClient,
  type IStorefrontClient,
  type StorefrontClientConfig,
  type ThemeConfig,
  mergeThemes,
  defaultTheme,
} from "@hcp/storefront-sdk";

export interface HcpStorefrontProviderProps {
  publishableKey: string;
  baseUrl?: string;
  locale?: string;
  theme?: Partial<ThemeConfig>;
  mockMode?: boolean;
  client?: IStorefrontClient;
  children: ReactNode;
}

interface StorefrontContextValue {
  client: IStorefrontClient;
  theme: ThemeConfig;
  locale: string;
  mockMode: boolean;
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

export function HcpStorefrontProvider({
  publishableKey,
  baseUrl,
  locale = "en-US",
  theme,
  mockMode = true,
  client,
  children,
}: HcpStorefrontProviderProps) {
  const value = useMemo<StorefrontContextValue>(() => {
    const resolvedClient =
      client ??
      createStorefrontClient({
        publishableKey,
        baseUrl,
        locale,
        mock: mockMode,
      } satisfies StorefrontClientConfig);
    return {
      client: resolvedClient,
      theme: mergeThemes(defaultTheme, theme),
      locale,
      mockMode,
    };
  }, [baseUrl, client, locale, mockMode, publishableKey, theme]);

  return (
    <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>
  );
}

export function useStorefrontContext(): StorefrontContextValue {
  const ctx = useContext(StorefrontContext);
  if (!ctx) {
    throw new Error("useStorefrontContext must be used within HcpStorefrontProvider");
  }
  return ctx;
}

export function useStorefrontClient(): IStorefrontClient {
  return useStorefrontContext().client;
}

export function useWidgetEventEmitter(
  onEvent?: (event: import("@hcp/storefront-sdk").WidgetEvent) => void,
) {
  return useCallback(
    (event: import("@hcp/storefront-sdk").WidgetEvent) => {
      onEvent?.(event);
    },
    [onEvent],
  );
}
