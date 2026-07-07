/**
 * Inline icon set for visual slides.
 *
 * Syntax in `.slide`: `:icon-name:` anywhere in inline text. It expands to an
 * inline SVG that inherits the surrounding text colour (`currentColor`) and
 * font size (sized in `em`). This keeps decks light and LLM-friendly — an LLM
 * can enumerate the names below — with no image files or external requests.
 *
 * Icons are stroke-based (Lucide-style, 24x24 viewBox). To add one, drop its
 * inner SVG markup (paths/lines/circles) into ICONS keyed by a kebab-case name.
 */

/** Inner SVG markup per icon (no <svg> wrapper — that's added at render time). */
const ICONS: Record<string, string> = {
  // Cloud / infra
  cloud: `<path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.7 1.5A3.5 3.5 0 0 0 6 19z"/>`,
  server: `<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><line x1="7" y1="7" x2="7" y2="7"/><line x1="7" y1="17" x2="7" y2="17"/>`,
  database: `<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>`,
  network: `<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v4M12 12H5v4M12 12h7v4"/>`,
  lock: `<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  shield: `<path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5z"/>`,
  // Process / flow
  rocket: `<path d="M5 13c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M12 15 9 12c1-4 4-8 9-9 0 5-4 8-9 9z"/><circle cx="14.5" cy="9.5" r="1.2"/>`,
  target: `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>`,
  zap: `<path d="M13 2 4 14h7l-2 8 9-12h-7z"/>`,
  check: `<path d="M20 6 9 17l-5-5"/>`,
  "check-circle": `<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>`,
  x: `<path d="M18 6 6 18M6 6l12 12"/>`,
  "alert-triangle": `<path d="M12 3 2 20h20z"/><line x1="12" y1="9" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>`,
  // People / business
  users: `<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.5a3.5 3.5 0 0 1 0 6.5M18 20c0-2.5-1-4-2.5-4.7"/>`,
  user: `<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>`,
  briefcase: `<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`,
  "trending-up": `<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>`,
  "bar-chart": `<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7"/><rect x="11" y="6" width="3" height="12"/><rect x="17" y="14" width="3" height="4"/>`,
  "dollar-sign": `<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 6.5C17 4.5 14.8 3.5 12 3.5S7 4.8 7 7s2 3 5 3.5 5 1.3 5 3.5-2.2 3.5-5 3.5-5-1-5-3"/>`,
  // Tech / dev
  code: `<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 4l-4 16"/>`,
  cpu: `<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>`,
  box: `<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>`,
  layers: `<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>`,
  git: `<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="9" r="2.5"/><path d="M6 8.5v7M15.6 9.7A6 6 0 0 1 9 15.5"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M5 5l2 2M17 17l2 2M2 12h3M19 12h3M5 19l2-2M17 7l2-2"/>`,
  // Misc visual
  lightbulb: `<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3z"/>`,
  star: `<path d="m12 3 2.9 6 6.1.9-4.5 4.3 1.1 6.1L12 17.8 6.4 20.3l1.1-6.1L3 9.9 9.1 9z"/>`,
  flag: `<path d="M4 21V4M4 4h12l-2 4 2 4H4"/>`,
  globe: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z"/>`,
  arrow_right: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  "arrow-right": `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  mail: `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 6 10 7 10-7"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`,
  coffee: `<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2"/><path d="M7 2v2M11 2v2"/>`,
  feather: `<path d="M20 4a7 7 0 0 0-10 0L4 10v6h6l6-6a7 7 0 0 0 4-6z"/><path d="M4 20 13 11M8 12h5v-5"/>`,
};

export const ICON_NAMES = Object.keys(ICONS).sort();

const ICON_RE = /:([a-z][a-z0-9_-]*):/g;

/** Render a single named icon to an inline SVG string, or null if unknown. */
export function iconSvg(name: string): string | null {
  const inner = ICONS[name];
  if (!inner) return null;
  return (
    `<svg class="dw-icon" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${inner}</svg>`
  );
}

/**
 * Replace every `:icon-name:` token in an HTML fragment with its inline SVG.
 * Unknown names are left untouched (so things like `:)` or times like 12:30
 * aren't mangled — the regex already requires a leading letter).
 */
export function expandIcons(html: string): string {
  return html.replace(ICON_RE, (whole, name: string) => iconSvg(name) ?? whole);
}
