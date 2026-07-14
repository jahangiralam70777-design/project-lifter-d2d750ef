import { useSetting } from "@/hooks/use-site-content";

type ThemeTokens = {
  brand_primary?: string;
  brand_secondary?: string;
  brand_accent?: string;
  background?: string;
  foreground?: string;
  radius?: number | string;
  font_display?: string;
  font_body?: string;
  gradient_cta?: string;
};

const DEFAULTS: ThemeTokens = {};

/**
 * Reads the published `theme` site_setting and injects it as CSS variables on
 * <html> via a single <style> tag. SSR-safe: outputs deterministic markup,
 * never touches `document`. Dark/light mode is preserved because empty/missing
 * keys are left untouched so styles.css defaults apply.
 */
export function ThemeInjector() {
  const theme = useSetting<ThemeTokens>("theme", DEFAULTS);
  const lines: string[] = [];

  const stringMap: Array<[keyof ThemeTokens, string]> = [
    ["brand_primary", "--primary"],
    ["brand_secondary", "--secondary"],
    ["brand_accent", "--accent"],
    ["background", "--background"],
    ["foreground", "--foreground"],
    ["font_display", "--font-display"],
    ["font_body", "--font-body"],
    ["gradient_cta", "--gradient-cta"],
  ];
  for (const [key, cssVar] of stringMap) {
    const v = theme[key];
    if (typeof v === "string" && v.trim()) {
      const safe = v.replace(/[;{}<>]/g, "").trim();
      lines.push(`${cssVar}:${safe};`);
    }
  }
  // Radius: numeric → px, string preserved.
  if (theme.radius != null) {
    const r =
      typeof theme.radius === "number"
        ? `${theme.radius}px`
        : String(theme.radius)
            .replace(/[;{}<>]/g, "")
            .trim();
    if (r) lines.push(`--radius:${r};`);
  }

  if (lines.length === 0) return null;
  return <style data-theme-injector="published">{`:root{${lines.join("")}}`}</style>;
}
