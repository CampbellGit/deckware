/**
 * Theme registry.
 *
 * Themes are **config files**, not code: each is a `*.theme.json` file in this
 * directory. To add a theme, drop a new `mybrand.theme.json` here — no code
 * change, no registry edit. Files are discovered at build time via Vite's
 * `import.meta.glob`.
 *
 * A theme is a bag of CSS custom properties (+ optional Google Fonts). It may
 * `"extends"` another theme by name to inherit its `vars` and only override
 * what changes.
 */
import type { Theme } from "./types";

export type { Theme } from "./types";
export { themeVars, googleFontsHref, flattenTheme } from "./types";
export type { ThemeFlat } from "./types";

// Eagerly import every theme config in this folder. The key is the file path;
// the value is the parsed JSON (Vite handles .json import as a JS object).
const modules = import.meta.glob<{ default: Theme }>("./*.theme.json", {
  eager: true,
});

const RAW: Record<string, Theme> = {};
for (const mod of Object.values(modules)) {
  const t = mod.default;
  if (t?.name) RAW[t.name] = t;
}

/** Resolve a theme's `extends` chain into a single flattened `vars` map. */
function flatten(name: string, seen: Set<string> = new Set()): Theme {
  const t = RAW[name];
  if (!t) return RAW.minimal ?? { name: "minimal", label: "Minimal", vars: {} };
  if (!t.extends || seen.has(name)) return t;
  seen.add(name);
  const base = flatten(t.extends, seen);
  return { ...t, vars: { ...base.vars, ...t.vars } };
}

const BY_NAME: Record<string, Theme> = {};
for (const name of Object.keys(RAW)) BY_NAME[name] = flatten(name);

/** Resolve a theme by name, falling back to minimal. */
export function resolveTheme(name: string): Theme {
  return BY_NAME[name] ?? BY_NAME.minimal;
}

/** List all themes (for the inspector dropdown), sorted with minimal first. */
export function listThemes(): { name: string; label: string }[] {
  return Object.values(BY_NAME)
    .map((t) => ({ name: t.name, label: t.label }))
    .sort((a, b) =>
      a.name === "minimal" ? -1 : b.name === "minimal" ? 1 : a.label.localeCompare(b.label),
    );
}
