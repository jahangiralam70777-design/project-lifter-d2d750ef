// Shared PDF theme presets used by both the server-side leaderboard export
// (pdf-lib) and the client-side demo generator (jsPDF). Keeping the palette
// in one place guarantees Preview and Download render with identical colors
// regardless of which engine produced the bytes.

export type PdfThemeName =
  | "Emerald Green"
  | "Royal Blue"
  | "Purple"
  | "Crimson Red"
  | "Dark Navy"
  | "Premium Black"
  | "Golden Edition";

export interface PdfThemePreset {
  name: PdfThemeName;
  /** Primary brand color — header band + table header. */
  primary: string;
  /** Darker shade for gradient accent + shadows. */
  primaryDark: string;
  /** Contrast text color drawn on the primary band. */
  onPrimary: string;
  /** Subtle body accent color for zebra striping / info card. */
  soft: string;
  /** Metallic accent used for hairlines / rank pill / dividers. */
  gold: string;
}

export const PDF_THEME_PRESETS: PdfThemePreset[] = [
  {
    name: "Emerald Green",
    primary: "#059669",
    primaryDark: "#064E3B",
    onPrimary: "#FFFFFF",
    soft: "#ECFDF5",
    gold: "#D4AF37",
  },
  {
    name: "Royal Blue",
    primary: "#1D4ED8",
    primaryDark: "#1E3A8A",
    onPrimary: "#FFFFFF",
    soft: "#EFF6FF",
    gold: "#D4AF37",
  },
  {
    name: "Purple",
    primary: "#7C3AED",
    primaryDark: "#4C1D95",
    onPrimary: "#FFFFFF",
    soft: "#F5F3FF",
    gold: "#D4AF37",
  },
  {
    name: "Crimson Red",
    primary: "#DC2626",
    primaryDark: "#7F1D1D",
    onPrimary: "#FFFFFF",
    soft: "#FEF2F2",
    gold: "#D4AF37",
  },
  {
    name: "Dark Navy",
    primary: "#0F172A",
    primaryDark: "#020617",
    onPrimary: "#FFFFFF",
    soft: "#F1F5F9",
    gold: "#D4AF37",
  },
  {
    name: "Premium Black",
    primary: "#111111",
    primaryDark: "#000000",
    onPrimary: "#FFFFFF",
    soft: "#F5F5F5",
    gold: "#D4AF37",
  },
  {
    name: "Golden Edition",
    primary: "#B8860B",
    primaryDark: "#7A5B0F",
    onPrimary: "#FFFFFF",
    soft: "#FFF8E1",
    gold: "#FFFFFF",
  },
];

export const DEFAULT_PDF_THEME: PdfThemePreset = PDF_THEME_PRESETS[0];

/** Resolve a theme by matching its primary hex color, case-insensitively. */
export function resolvePdfTheme(
  hex: string | null | undefined,
): PdfThemePreset {
  if (!hex) return DEFAULT_PDF_THEME;
  const needle = hex.toLowerCase();
  return (
    PDF_THEME_PRESETS.find((t) => t.primary.toLowerCase() === needle) ??
    // If an unknown color is supplied, synthesize a matching preset around it
    // so custom palettes still render coherently.
    {
      name: "Emerald Green",
      primary: hex,
      primaryDark: darkenHex(hex, 0.35),
      onPrimary: "#FFFFFF",
      soft: "#F5F5F7",
      gold: "#D4AF37",
    }
  );
}

export function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToRgbNormalized(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgbTuple(hex);
  return [r / 255, g / 255, b / 255];
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgbTuple(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  const to = (c: number) => f(c).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// About text is baked into every page footer of every exported PDF.
export const CAABD_ABOUT = {
  siteName: "CA Aspire BD",
  website: "caaspirebd.xyz",
  heading: "About CA Aspire BD",
  body:
    "CA Aspire BD is a modern learning platform dedicated to helping ICAB students prepare smarter through structured Exam Batches, MCQ Practice, Performance Analytics, Leaderboards, and Premium Study Resources. Our mission is to make CA preparation smarter, easier, and more effective for every aspiring Chartered Accountant.",
  copyright: "© CA Aspire BD • All Rights Reserved",
};

// Fixed rows-per-page for the leaderboard table. Requirement locks this at 15.
export const LEADERBOARD_ROWS_PER_PAGE = 15;

// Distinct medal palette for the top 3 ranks. These are theme-independent so
// gold/silver/bronze always read correctly, matching the reference design.
export const MEDAL_COLORS: Record<1 | 2 | 3, string> = {
  1: "#D4AF37", // gold
  2: "#B8BFC6", // silver
  3: "#CD7F32", // bronze
};

// Tagline drawn under the header title on every page.
export const CAABD_TAGLINE = "Excellence Today, Leadership Tomorrow";

// Premium brand accents used by the redesigned leaderboard PDF. These are
// intentionally theme-independent so the corporate look stays consistent
// regardless of the primary color chosen from `PDF_THEME_PRESETS`.
export const BRAND_GOLD = "#F59E0B";
export const BRAND_SOFT_BG = "#F8FAFC";
export const BRAND_CARD_BORDER = "#E2E8F0";
export const BRAND_INK = "#0F172A";
export const BRAND_INK_SOFT = "#475569";
export const BRAND_ABOUT_BODY =
  "CA Aspire BD is Bangladesh's modern Chartered Accountancy learning platform dedicated to helping ICAB students prepare through structured Exam Batches, MCQ Practice, Performance Analytics, Mock Exams and Smart Study Resources. Our mission is to make CA preparation simpler, smarter and more effective.";