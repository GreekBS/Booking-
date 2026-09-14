export type ThemePreset = "light" | "dark" | "minimal";

export interface ThemeColors {
  primary: string;
  primaryForeground: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
  success: string;
  error: string;
}

export interface ThemeTypography {
  fontFamily?: string;
  fontFamilyHeading?: string;
  baseFontSize?: string;
}

export interface ThemeRadius {
  sm: string;
  md: string;
  lg: string;
}

export interface ThemeSpacing {
  unit: number;
}

export interface ThemeConfig {
  preset?: ThemePreset;
  colors: ThemeColors;
  typography: ThemeTypography;
  radius: ThemeRadius;
  spacing?: ThemeSpacing;
  logoUrl?: string;
}

export const defaultTheme: ThemeConfig = {
  preset: "light",
  colors: {
    primary: "#1a5f4a",
    primaryForeground: "#ffffff",
    background: "#ffffff",
    foreground: "#111827",
    muted: "#f3f4f6",
    border: "#e5e7eb",
    success: "#059669",
    error: "#dc2626",
  },
  typography: {
    fontFamily: "system-ui, sans-serif",
    baseFontSize: "16px",
  },
  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
  },
  spacing: { unit: 4 },
};

export function mergeThemes(
  base: ThemeConfig,
  override?: Partial<ThemeConfig>,
): ThemeConfig {
  if (!override) {
    return base;
  }
  return {
    preset: override.preset ?? base.preset,
    colors: { ...base.colors, ...override.colors },
    typography: { ...base.typography, ...override.typography },
    radius: { ...base.radius, ...override.radius },
    spacing: override.spacing ?? base.spacing,
    logoUrl: override.logoUrl ?? base.logoUrl,
  };
}

export function themeToCssVariables(theme: ThemeConfig): Record<string, string> {
  return {
    "--hcp-color-primary": theme.colors.primary,
    "--hcp-color-primary-foreground": theme.colors.primaryForeground,
    "--hcp-color-background": theme.colors.background,
    "--hcp-color-foreground": theme.colors.foreground,
    "--hcp-color-muted": theme.colors.muted,
    "--hcp-color-border": theme.colors.border,
    "--hcp-color-success": theme.colors.success,
    "--hcp-color-error": theme.colors.error,
    "--hcp-font-family": theme.typography.fontFamily ?? "system-ui, sans-serif",
    "--hcp-font-family-heading":
      theme.typography.fontFamilyHeading ?? theme.typography.fontFamily ?? "system-ui, sans-serif",
    "--hcp-font-size-base": theme.typography.baseFontSize ?? "16px",
    "--hcp-radius-sm": theme.radius.sm,
    "--hcp-radius-md": theme.radius.md,
    "--hcp-radius-lg": theme.radius.lg,
  };
}
