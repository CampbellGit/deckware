/**
 * Background resolution. A slide (or the whole deck) can declare a background:
 *
 *   bg: #0f1115            arbitrary hex
 *   bg: accent             a named palette token (resolves to the theme var)
 *   bg: white              a CSS named colour
 *   bg: image(hero.jpg)    a referenced image (path or URL — never embedded)
 *
 * Plus modifiers (only meaningful for images, except dim which also tints
 * solid colours):
 *   bg-fit: cover | contain
 *   bg-dim: 0.4            dark overlay opacity 0..1, keeps text legible
 *
 * This module is pure: value in, CSS + a text-contrast decision out. The
 * renderer turns that into inline style on the `.slide` element.
 */
import type { Theme } from "./theme";

/** Palette tokens usable as a background colour. */
const PALETTE_TOKENS = new Set([
  "bg", "fg", "muted", "accent", "primary", "success", "warning", "danger",
]);

export interface BgSpec {
  kind: "color" | "image";
  /** Resolved CSS colour (for kind="color", or the dim tint base). */
  color?: string;
  /** Image URL/path (for kind="image"). */
  url?: string;
  fit: "cover" | "contain";
  /** Overlay darkness 0..1 (0 = none). */
  dim: number;
}

const IMAGE_RE = /^image\(\s*(.+?)\s*\)$/i;

/** Parse a raw `bg:` value into a spec, resolving colour tokens via the theme. */
export function parseBg(
  value: string | undefined,
  theme: Theme,
  fit: string | undefined,
  dim: string | undefined,
): BgSpec | null {
  if (!value) return null;
  const v = value.trim();
  const dimNum = clamp01(Number(dim));
  const fitVal = fit === "contain" ? "contain" : "cover";

  const img = v.match(IMAGE_RE);
  if (img) {
    return {
      kind: "image",
      url: img[1].replace(/^['"]|['"]$/g, ""),
      fit: fitVal,
      // Images get a small default dim so light text stays readable, unless
      // the author opted out with bg-dim: 0.
      dim: dim == null ? 0.35 : dimNum,
    };
  }

  return {
    kind: "color",
    color: resolveColor(v, theme),
    fit: fitVal,
    dim: dimNum,
  };
}

/** Resolve a colour token / hex / named colour to a concrete CSS colour. */
export function resolveColor(value: string, theme: Theme): string {
  const v = value.trim();
  if (PALETTE_TOKENS.has(v)) {
    return theme.vars[`--color-${v}`] ?? v;
  }
  return v; // hex (#…) or CSS named colour, used verbatim
}

/**
 * Build the inline CSS for a background spec. Returns both the declarations to
 * put on `.slide` and an optional `--color-fg` override so text stays legible
 * (auto-contrast for solid colours; white-ish for dimmed images).
 */
export function bgCss(spec: BgSpec): { decls: string; fgOverride?: string } {
  if (spec.kind === "image") {
    const layers: string[] = [];
    if (spec.dim > 0) {
      layers.push(
        `linear-gradient(rgba(0,0,0,${spec.dim}), rgba(0,0,0,${spec.dim}))`,
      );
    }
    // Single quotes inside url(): the whole declaration is later embedded in a
    // double-quoted HTML style="" attribute, so double quotes would truncate it.
    layers.push(`url('${cssEscapeUrl(spec.url!)}')`);
    const decls =
      `background-image: ${layers.join(", ")};` +
      `background-size: ${spec.fit};` +
      `background-position: center;` +
      `background-repeat: no-repeat;`;
    // Over a dimmed photo, force light text + a soft shadow for contrast.
    return spec.dim >= 0.15
      ? { decls, fgOverride: "#ffffff" }
      : { decls };
  }

  // Solid colour: optionally tint with the dim overlay via colour-mix.
  const base = spec.color!;
  const color =
    spec.dim > 0
      ? `color-mix(in srgb, ${base} ${Math.round((1 - spec.dim) * 100)}%, #000)`
      : base;
  const fg = autoContrastFg(base);
  return {
    decls: `background-color: ${color};`,
    ...(fg ? { fgOverride: fg } : {}),
  };
}

/**
 * Pick a legible text colour for a solid background, if we can parse it as a
 * hex. Returns undefined for non-hex (named/var) colours, leaving the theme's
 * own --color-fg in place.
 */
export function autoContrastFg(color: string): string | undefined {
  const rgb = hexToRgb(color);
  if (!rgb) return undefined;
  // Relative luminance (sRGB, perceptual-ish).
  const [r, g, b] = rgb.map((c) => c / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.5 ? "#ffffff" : "#1a1a1a";
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function cssEscapeUrl(url: string): string {
  // Prevent breaking out of the url('…') context (escape single quotes,
  // backslashes) and out of the surrounding HTML attribute (escape double
  // quotes too, since the declaration lands in style="…").
  return url.replace(/['"\\]/g, "\\$&");
}
