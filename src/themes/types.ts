/**
 * A theme maps the deck's abstract tokens (type scale, spacing, colour palette)
 * to concrete values. The renderer's stylesheet is written entirely against
 * these CSS custom properties, so a new theme never touches layout code.
 *
 * Each theme lives in its own file under src/themes/ and is registered in
 * src/themes/index.ts. To add a theme, copy an existing file and tweak.
 */
export interface Theme {
  /** Unique theme id (used in front matter `theme:` and the picker). */
  name: string;
  /** Human-facing label for the inspector dropdown. */
  label: string;
  /**
   * Optional base theme name to inherit `vars` from. The base's vars are the
   * starting point; this theme's `vars` override them. Lets a brand theme say
   * `"extends": "minimal"` and only list what changes.
   */
  extends?: string;
  /** CSS custom properties applied to every `.slide` element. */
  vars: Record<string, string>;
  /**
   * Google Font families to load (e.g. ["Josefin Sans", "Inter"]). The preview
   * and exported HTML inject the matching <link>. Omit for system fonts.
   */
  googleFonts?: string[];
}

/** Serialize a theme's vars into a CSS declaration body. */
export function themeVars(theme: Theme): string {
  return Object.entries(theme.vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(" ");
}

/**
 * Build the Google Fonts <link> href for a theme, or null if it uses only
 * system fonts. Weights are kept broad so headings/body both render well.
 */
export function googleFontsHref(theme: Theme): string | null {
  if (!theme.googleFonts?.length) return null;
  const families = theme.googleFonts
    .map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * Resolve a few key concrete colours/fonts for non-CSS consumers (PPTX export),
 * which need real hex strings and font names rather than CSS variables.
 */
export interface ThemeFlat {
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
}

const HEX = /^#?[0-9a-f]{3,8}$/i;

function firstFamily(stack: string): string {
  // "Inter, sans-serif" -> "Inter"; strip quotes.
  return stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
}

export function flattenTheme(theme: Theme): ThemeFlat {
  const v = theme.vars;
  const hex = (s: string, fallback: string) =>
    HEX.test(s) ? (s.startsWith("#") ? s : `#${s}`) : fallback;
  return {
    bg: hex(v["--color-bg"] ?? "", "#FFFFFF"),
    fg: hex(v["--color-fg"] ?? "", "#1A1A1A"),
    muted: hex(v["--color-muted"] ?? "", "#6B7280"),
    accent: hex(v["--color-accent"] ?? "", "#2563EB"),
    headingFont: firstFamily(v["--font-heading"] ?? v["--font-body"] ?? "Arial"),
    bodyFont: firstFamily(v["--font-body"] ?? "Arial"),
  };
}
