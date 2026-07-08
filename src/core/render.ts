/**
 * Renderer: Deck IR -> HTML + CSS.
 *
 * The same output drives the live preview, the exported self-contained HTML,
 * and (via print CSS) the PDF. There is exactly one rendering path so the three
 * can never drift.
 *
 * Layouts are implemented as CSS classes on a `.slide` element plus a small
 * amount of block routing (e.g. `two-up` splits blocks into two columns). The
 * stylesheet is written entirely against theme custom properties.
 */
import type { Block, Deck, Slide } from "./ir";
import { resolveTheme, themeVars } from "./theme";
import { parseBg, bgCss } from "./background";

export interface RenderedSlide {
  html: string;
  notes?: string;
}

export interface RenderOptions {
  /**
   * When true, each block's root element is tagged with `data-block="<i>"`
   * (its index in the slide's block list) so the editor preview can map a
   * click back to the IR. Off for exported decks.
   */
  editable?: boolean;
  /**
   * Optional resolver for image references. The live editor uses this to turn
   * a locally-picked filename into a session blob URL so the preview shows it
   * immediately, while the source keeps the light `image(filename)` reference.
   * Returns undefined to leave the reference as-is.
   */
  resolveImage?: (ref: string) => string | undefined;
}

/** Render every slide to its inner HTML (no surrounding document). */
export function renderSlides(
  deck: Deck,
  opts: RenderOptions = {},
): RenderedSlide[] {
  const theme = resolveTheme(deck.meta.theme);
  return deck.slides.map((s) => ({
    html: renderSlide(s, deck, theme, opts),
    notes: s.notes,
  }));
}

function renderSlide(
  slide: Slide,
  deck: Deck,
  theme: ReturnType<typeof resolveTheme>,
  opts: RenderOptions,
): string {
  const align = slide.layout.align ?? defaultAlign(slide.layout.name);
  const classes = [
    "slide",
    `layout-${slide.layout.name}`,
    `align-${align}`,
  ].join(" ");

  // Background: the slide's own bg overrides the deck-wide default. bg-fit /
  // bg-dim fall back to the deck defaults too.
  const spec = parseBg(
    slide.layout.bg ?? deck.meta.bg,
    theme,
    slide.layout["bg-fit"] ?? deck.meta["bg-fit"],
    slide.layout["bg-dim"] ?? deck.meta["bg-dim"],
  );
  // Swap a locally-picked image reference for its session blob URL (preview
  // only) — the source keeps the light `image(filename)` reference.
  if (spec?.kind === "image" && spec.url && opts.resolveImage) {
    spec.url = opts.resolveImage(spec.url) ?? spec.url;
  }
  let style = "";
  if (spec) {
    const { decls, fgOverride } = bgCss(spec);
    // When the background forces a contrast colour, also override the heading,
    // link (accent) and muted colours — otherwise a theme like Indigo keeps
    // its brand-blue headings/links and grey muted text, which are unreadable
    // on a dark slide background. Muted goes to a translucent version of the
    // contrast colour so subtitles read as secondary but still legible.
    const fgVars = fgOverride
      ? `--color-fg: ${fgOverride};--color-heading: ${fgOverride};` +
        `--color-accent: ${fgOverride};--color-muted: ${mutedOf(fgOverride)};`
      : "";
    style = ` style="${decls}${fgVars}"`;
  }

  const inner = layoutBody(slide, opts);
  return `<section class="${classes}"${style}><div class="slide-content">${inner}</div></section>`;
}

/** A muted variant of a forced-contrast colour for subtitles over a photo. */
function mutedOf(fg: string): string {
  // White contrast → soft white; dark contrast → soft dark. Translucency keeps
  // it secondary without dropping below readable on the dimmed photo.
  return fg === "#ffffff" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.6)";
}

function defaultAlign(layout: string): string {
  switch (layout) {
    case "title":
    case "section":
    case "quote":
      return "center"; // full centre (vertical + horizontal text)
    default:
      // Content slides: vertically centred in the slide, text stays left —
      // so the slide is "present" rather than hugging the top edge.
      return "middle";
  }
}

/** Produce the inner HTML for a slide, applying any layout-specific routing. */
function layoutBody(slide: Slide, opts: RenderOptions): string {
  // Carry each block's original index so selection survives column routing.
  const indexed = slide.blocks.map((block, i) => ({ block, i }));
  const col = (items: typeof indexed) =>
    `<div class="col">${items
      .map(({ block, i }) => renderBlock(block, i, opts))
      .join("")}</div>`;

  // Explicit columns via `:::` separators take precedence over any layout.
  // Blocks with no column (before the first `:::`) render full-width above the
  // column row; columned blocks are grouped into equal columns.
  if (indexed.some(({ block }) => block.column != null)) {
    const full = indexed.filter(({ block }) => block.column == null);
    const columned = indexed.filter(({ block }) => block.column != null);
    const n = Math.max(...columned.map(({ block }) => block.column!)) + 1;
    const cols = Array.from({ length: n }, (_, c) =>
      col(columned.filter(({ block }) => block.column === c)),
    );
    const head = full.map(({ block, i }) => renderBlock(block, i, opts)).join("");
    return head + `<div class="cols cols-${n}">${cols.join("")}</div>`;
  }

  if (slide.layout.name === "two-up") {
    const left = indexed.filter(({ block }) => !block.hints.includes("right"));
    const right = indexed.filter(({ block }) => block.hints.includes("right"));
    return col(left) + col(right);
  }
  return indexed.map(({ block, i }) => renderBlock(block, i, opts)).join("");
}

/** Rewrite `<img src="ref">` through the resolver so locally-picked images
 *  (or any resolvable reference) point at a real/embeddable URL. */
function resolveImgSrcs(
  html: string,
  resolve: (ref: string) => string | undefined,
): string {
  return html.replace(
    /(<img\b[^>]*\bsrc=")([^"]*)(")/g,
    (_m, pre: string, src: string, post: string) =>
      `${pre}${resolve(src) ?? src}${post}`,
  );
}

function renderBlock(block: Block, index: number, opts: RenderOptions): string {
  const classes = block.hints.map((h) => `h-${h}`);
  if (opts.editable) classes.push("db-block");
  const cls = classes.join(" ");
  const data = opts.editable
    ? ` data-block="${index}" draggable="true"`
    : "";
  const attr = (cls ? ` class="${cls}"` : "") + data;
  const html = opts.resolveImage
    ? resolveImgSrcs(block.html, opts.resolveImage)
    : block.html;
  switch (block.type) {
    case "heading": {
      const lvl = block.level ?? 2;
      return `<h${lvl}${attr}>${html}</h${lvl}>`;
    }
    case "image":
      return `<figure${attr}>${html}</figure>`;
    case "list":
    case "quote":
    case "table":
    case "code":
      // These already carry their own block-level wrapper from the parser;
      // wrap them so the editor has a tagged, hint-styled root to select.
      return cls || data ? `<div${attr}>${html}</div>` : html;
    case "rule":
      return `<hr${data} />`;
    case "html":
      return html;
    case "paragraph":
    default:
      return `<p${attr}>${html}</p>`;
  }
}

/**
 * The deck stylesheet. Aspect ratio and theme are injected; everything else is
 * static and written against theme vars. Slides are sized in a square-ish `em`
 * world driven by `--slide-h`, so the type scale is resolution-independent.
 */
export function deckStylesheet(deck: Deck): string {
  const theme = resolveTheme(deck.meta.theme);
  const [w, h] = parseAspect(deck.meta.aspect);
  // Type/spacing scale to the slide *width* via container-query width units.
  // We express the design as a fraction of slide height, then convert to cqw by
  // the aspect factor (h/w) — because `container-type: inline-size` only tracks
  // width. Width-based sizing resolves identically in the live preview and the
  // full-screen player; `container-type: size` did NOT (it needs an explicit
  // height, which the aspect-ratio-only slide doesn't give, so cqh drifted).
  // Type scales to slide width. `k` is tuned so the type size matches the
  // original (smaller) look; the h/w factor converts the height-based design
  // numbers to width units for `container-type: inline-size`.
  const f = h / w;
  const k = 0.675; // overall type-scale trim to the preferred size
  const cqh = (n: number) => `${(n * f * k).toFixed(4)}cqw`;
  return `
.deck { --aspect-w: ${w}; --aspect-h: ${h}; }
.deck .slide {
  ${themeVars(theme)}
  position: relative;
  box-sizing: border-box;
  aspect-ratio: ${w} / ${h};
  width: 100%;
  background-color: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-body);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* The slide is its own sizing context. inline-size tracks the slide's
     width; the type scale below is in width-derived units, so text scales to
     the slide box itself — identical in the live preview and the full-screen
     deck. Padding lives on .slide-content (NOT here): padding in cqw on the
     container would shrink its own content-box and make cqw resolve
     differently at different render widths. */
  container-type: inline-size;
}
/* 1em == 4% of slide height (converted to width units). Padding is here so the
   container's inline-size stays equal to the full slide width. */
.deck .slide-content { font-size: ${cqh(4)}; padding: ${cqh(7)} 7cqw; display: flex; flex-direction: column; gap: var(--space-md); width: 100%; height: 100%; box-sizing: border-box; }
/* Default slides: the content block fills the slide and is vertically centred
   in the leftover space, so a slide is "present" instead of hugging the top. */
.deck .slide-content { flex: 1; justify-content: center; }
.deck .align-top .slide-content { justify-content: flex-start; }
.deck .align-center { justify-content: center; }
.deck .align-center .slide-content { text-align: center; align-items: center; }
.deck .align-bottom .slide-content { justify-content: flex-end; }

.deck .slide h1, .deck .slide h2, .deck .slide h3 {
  font-family: var(--font-heading, var(--font-body));
  color: var(--color-heading, var(--color-fg));
}
.deck .slide h1 { font-size: calc(var(--type-h1) * var(--fs-mult, 1)); line-height: 1.05; margin: 0; font-weight: 700; }
.deck .slide h2 { font-size: calc(var(--type-h2) * var(--fs-mult, 1)); line-height: 1.1; margin: 0; font-weight: 650; }
.deck .slide h3 { font-size: calc(var(--type-h3) * var(--fs-mult, 1)); margin: 0; font-weight: 600; }
.deck .slide p { font-size: calc(var(--type-base) * var(--fs-mult, 1)); line-height: 1.4; margin: 0; }
.deck .slide ul, .deck .slide ol { font-size: calc(var(--type-base) * var(--fs-mult, 1)); line-height: 1.5; margin: 0; padding-left: 1.2em; }
.deck .slide li { margin: 0.15em 0; }
.deck .slide a { color: var(--color-accent); }
.deck .slide img { max-width: 100%; max-height: 100%; display: block; border-radius: 4px; }
.deck .slide .dw-icon { width: 1em; height: 1em; display: inline-block; vertical-align: -0.125em; flex: none; }
/* A heading or paragraph that is only an icon reads as a feature glyph. */
.deck .slide h1 .dw-icon, .deck .slide h2 .dw-icon { width: 1.1em; height: 1.1em; }
.deck .slide figure { margin: 0; }
.deck .slide hr { border: none; border-top: 2px solid var(--color-rule); width: 100%; margin: var(--space-sm) 0; }
.deck .slide blockquote {
  margin: 0; padding-left: var(--space-md);
  border-left: 4px solid var(--color-accent);
  font-style: italic;
  font-size: calc(var(--type-base) * var(--fs-mult, 1));
}
.deck .slide pre {
  background: var(--color-code-bg); border-radius: 6px;
  padding: var(--space-md); overflow: auto; font-size: var(--type-small);
}
.deck .slide code { font-family: var(--font-mono); }
.deck .slide :not(pre) > code { background: var(--color-code-bg); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
.deck .slide table { border-collapse: collapse; font-size: var(--type-base); }
.deck .slide th, .deck .slide td { border: 1px solid var(--color-rule); padding: 0.3em 0.6em; text-align: left; }

/* Layout: two-up */
.deck .layout-two-up .slide-content { flex-direction: row; gap: var(--space-lg); align-items: center; }
.deck .layout-two-up .col { flex: 1; display: flex; flex-direction: column; gap: var(--space-md); min-width: 0; }

/* Columns via ::: separators. The .cols row sits inside .slide-content and
   splits available width into equal columns. */
.deck .cols { display: flex; flex-direction: row; gap: var(--space-lg); width: 100%; align-items: flex-start; }
.deck .cols .col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: var(--space-md); }

/* Layout: title / section / quote — emphasis handled via align-center */
.deck .layout-title h1 { font-size: calc(var(--type-h1) * 1.15); }
.deck .layout-section h1, .deck .layout-section h2 { font-size: calc(var(--type-h1) * 1.35 * var(--fs-mult, 1)); }
.deck .layout-quote blockquote { border: none; font-size: calc(var(--type-large) * var(--fs-mult, 1)); padding: 0; }

/* Hint vocabulary.
   Size hints are *multipliers* (--fs-mult), not absolute sizes, so they scale
   whatever they're applied to relative to its natural size — a {.large}
   heading gets larger, not smaller. The variable is inherited, so a hint on a
   list/quote wrapper flows into the inner p/li/blockquote automatically. Every
   text element multiplies its base size by var(--fs-mult, 1) below. */
.deck .slide .h-small { --fs-mult: 0.72; }
.deck .slide .h-large { --fs-mult: 1.4; }
.deck .slide .h-huge { --fs-mult: 2; line-height: 1.1; }
/* Colour hints. The .slide prefix raises specificity so a colour hint wins
   over the default heading colour (--color-heading) on h1/h2/h3. */
.deck .slide .h-muted { color: var(--color-muted); }
.deck .slide .h-accent { color: var(--color-accent); }
.deck .slide .h-primary { color: var(--color-primary); }
.deck .slide .h-success { color: var(--color-success); }
.deck .slide .h-warning { color: var(--color-warning); }
.deck .slide .h-danger { color: var(--color-danger); }

/* Editable affordances (only present when rendered with {editable:true}). */
.deck .db-block { cursor: pointer; border-radius: 4px; outline-offset: 3px; }
.deck .db-block:hover { outline: 1.5px dashed var(--color-accent); }
.deck .db-block.db-selected { outline: 2px solid var(--color-accent); }
.deck .h-left { align-self: flex-start; text-align: left; }
.deck .h-right { align-self: flex-end; text-align: right; }
.deck .h-center { align-self: center; text-align: center; }
.deck .h-half { width: 50%; }
.deck .h-third { width: 33.33%; }
.deck .h-two-thirds { width: 66.66%; }
.deck .h-full { width: 100%; }
.deck .h-fill { flex: 1; }
`.trim();
}

function parseAspect(aspect: string): [number, number] {
  const m = aspect.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!m) return [16, 9];
  return [Number(m[1]), Number(m[2])];
}
