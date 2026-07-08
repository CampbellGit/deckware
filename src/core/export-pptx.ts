/**
 * PPTX export. Deck IR -> a real .pptx via pptxgenjs, entirely client-side.
 *
 * PowerPoint is a fixed-position model (inches on a 13.333 x 7.5" 16:9 stage),
 * which is the opposite of deckware's auto-flow. So this is necessarily a
 * *mapping*, not a pixel-perfect render: we place a title region and a body
 * region per layout, convert each block to plain text + simple bold/italic
 * runs, and apply the theme's colours/fonts. It will look on-brand and editable
 * in PowerPoint, not identical to the HTML deck.
 */
import type PptxGenJS from "pptxgenjs";
import type { Block, Deck, Slide } from "./ir";
import { resolveTheme, flattenTheme } from "./theme";
import { parseBg } from "./background";

// 16:9 stage in inches (pptxgenjs "LAYOUT_WIDE").
const W = 13.333;
const H = 7.5;
const MARGIN = 0.8;

type Pptx = InstanceType<typeof PptxGenJS>;
type TextRun = { text: string; options?: Record<string, unknown> };

export interface ExportPptxOptions {
  /** Resolve an image reference (e.g. a locally-picked filename) to an
   *  embeddable data URL / URL so the PPTX contains the picture. */
  resolveImage?: (ref: string) => string | undefined;
  /** Rasterize an SVG source to a PNG data URL. PowerPoint has no SVG support,
   *  so SVG backgrounds/figures must be converted to bitmaps first. Async;
   *  runs during the pre-pass before slides are built. */
  rasterizeSvg?: (src: string) => Promise<string>;
}

/** Module-scoped resolver, set per export() call and read by the image spots.
 *  It already folds in SVG→PNG results from the async pre-pass. */
let RESOLVE_IMAGE: ((ref: string) => string | undefined) | undefined;

/** Collect every image reference used in the deck (backgrounds + inline). */
function collectImageRefs(deck: Deck): string[] {
  const refs = new Set<string>();
  const bg = (v?: string) => {
    const m = v?.match(/^image\(\s*(.+?)\s*\)$/i);
    if (m) refs.add(m[1].replace(/^['"]|['"]$/g, ""));
  };
  bg(deck.meta.bg);
  for (const slide of deck.slides) {
    bg(slide.layout.bg);
    for (const b of slide.blocks) {
      const m = b.md.match(/!\[[^\]]*\]\(([^)]*)\)/);
      if (m) refs.add(m[1]);
    }
  }
  return [...refs];
}

export async function exportPptx(
  deck: Deck,
  opts: ExportPptxOptions = {},
): Promise<Blob> {
  // Pre-pass: resolve every image ref, and rasterize any SVG to PNG (PowerPoint
  // can't render SVG). Build a ref → embeddable-source map the sync renderer
  // reads via RESOLVE_IMAGE.
  const resolved = new Map<string, string>();
  for (const ref of collectImageRefs(deck)) {
    let src = opts.resolveImage?.(ref) ?? ref;
    if (opts.rasterizeSvg && isSvgSource(src)) {
      try {
        src = await opts.rasterizeSvg(src);
      } catch {
        // Rasterization failed (e.g. cross-origin) — drop the SVG rather than
        // embed bytes PowerPoint can't display.
        continue;
      }
    }
    resolved.set(ref, src);
  }
  RESOLVE_IMAGE = (ref: string) => resolved.get(ref) ?? opts.resolveImage?.(ref) ?? ref;

  // Dynamic import keeps pptxgenjs out of the initial bundle.
  const mod = await import("pptxgenjs");
  const PptxGen = mod.default;
  const pptx = new PptxGen();
  pptx.defineLayout({ name: "DW", width: W, height: H });
  pptx.layout = "DW";

  const theme = resolveTheme(deck.meta.theme);
  const flat = flattenTheme(theme);
  if (deck.meta.title) pptx.title = deck.meta.title;

  for (const slide of deck.slides) {
    renderSlide(pptx, slide, deck, flat);
  }

  // Output as a Blob so the caller can trigger a download.
  return (await pptx.write({ outputType: "blob" })) as Blob;
}

/** True for an SVG source: a data: URL or a path ending in .svg. */
function isSvgSource(src: string): boolean {
  return /^data:image\/svg\+xml/i.test(src) || /\.svg(\?|#|$)/i.test(src);
}

function renderSlide(
  pptx: Pptx,
  slide: Slide,
  deck: Deck,
  flat: ReturnType<typeof flattenTheme>,
) {
  const s = pptx.addSlide();
  const theme = resolveTheme(deck.meta.theme);

  // --- Background -------------------------------------------------------
  const spec = parseBg(
    slide.layout.bg ?? deck.meta.bg,
    theme,
    slide.layout["bg-fit"] ?? deck.meta["bg-fit"],
    slide.layout["bg-dim"] ?? deck.meta["bg-dim"],
  );
  let fg = flat.fg;
  let forcedLight = false; // bg needs light text → also recolour headings
  if (spec?.kind === "color" && spec.color) {
    s.background = { color: hex(spec.color) };
    if (isDark(spec.color)) { fg = "FFFFFF"; forcedLight = true; }
  } else if (spec?.kind === "image" && spec.url) {
    // Locally-picked images resolve to an embeddable data URL; otherwise the
    // path/URL is used as-is. pptxgenjs needs `data` for data URLs and `path`
    // for real paths/URLs — passing a data URL as `path` throws ENAMETOOLONG.
    const resolved = RESOLVE_IMAGE?.(spec.url) ?? spec.url;
    const source = imageSource(resolved);
    if (source) {
      s.background = source;
      if (spec.dim >= 0.15) { fg = "FFFFFF"; forcedLight = true; }
    } else {
      // Unusable image (e.g. an un-rasterized SVG) — fall back to a solid fill.
      s.background = { color: hex(flat.bg) };
    }
  } else {
    s.background = { color: hex(flat.bg) };
  }

  // Headings keep the theme's brand colour unless the background forced light
  // text (mirrors the HTML renderer's --color-heading override).
  const themeHeading = stripHash(theme.vars["--color-heading"]) ?? hex(flat.accent);
  const headingColor = forcedLight ? fg : themeHeading;
  const layout = slide.layout.name;

  // --- Layout-specific placement ---------------------------------------
  if (layout === "title" || layout === "section") {
    placeCentered(s, slide, flat, { headingColor, fg, big: layout === "section" });
    return;
  }
  if (layout === "quote") {
    placeQuote(s, slide, flat, fg);
    return;
  }
  if (layout === "two-up") {
    placeTwoUp(s, slide, flat, { headingColor, fg });
    return;
  }
  placeDefault(s, slide, flat, { headingColor, fg });
}

// --- Layout writers --------------------------------------------------------

function placeCentered(
  s: ReturnType<Pptx["addSlide"]>,
  slide: Slide,
  flat: ReturnType<typeof flattenTheme>,
  o: { headingColor: string; fg: string; big: boolean },
) {
  const headings = slide.blocks.filter((b) => b.type === "heading");
  const rest = slide.blocks.filter((b) => b.type !== "heading");
  const runs: TextRun[] = [];
  headings.forEach((b, i) => {
    runs.push({
      text: plain(b.md),
      options: {
        fontSize: i === 0 ? (o.big ? 48 : 44) : 26,
        bold: i === 0,
        color: i === 0 ? o.headingColor : colorFor(b, o.fg),
        fontFace: flat.headingFont,
        breakLine: true,
      },
    });
  });
  rest.forEach((b) =>
    runs.push({
      text: plain(b.md),
      options: {
        fontSize: 22,
        color: colorFor(b, o.fg),
        fontFace: flat.bodyFont,
        breakLine: true,
      },
    }),
  );
  s.addText(runs as never, {
    x: MARGIN,
    y: 0,
    w: W - MARGIN * 2,
    h: H,
    align: "center",
    valign: "middle",
  });
}

function placeQuote(
  s: ReturnType<Pptx["addSlide"]>,
  slide: Slide,
  flat: ReturnType<typeof flattenTheme>,
  fg: string,
) {
  const text = slide.blocks.map((b) => plain(b.md)).join("\n");
  s.addText(text, {
    x: MARGIN,
    y: 0,
    w: W - MARGIN * 2,
    h: H,
    align: "center",
    valign: "middle",
    italic: true,
    fontSize: 32,
    color: fg,
    fontFace: flat.bodyFont,
  });
}

function placeDefault(
  s: ReturnType<Pptx["addSlide"]>,
  slide: Slide,
  flat: ReturnType<typeof flattenTheme>,
  o: { headingColor: string; fg: string },
) {
  const heading = slide.blocks.find((b) => b.type === "heading");
  const body = slide.blocks.filter((b) => b !== heading);
  let y = MARGIN;
  if (heading) {
    s.addText(plain(heading.md), {
      x: MARGIN,
      y,
      w: W - MARGIN * 2,
      h: 1.1,
      fontSize: 34,
      bold: true,
      color: o.headingColor,
      fontFace: flat.headingFont,
    });
    y += 1.3;
  }
  addBodyRegion(s, body, flat, o.fg, { x: MARGIN, y, w: W - MARGIN * 2, h: H - y - 0.4 });
}

function placeTwoUp(
  s: ReturnType<Pptx["addSlide"]>,
  slide: Slide,
  flat: ReturnType<typeof flattenTheme>,
  o: { headingColor: string; fg: string },
) {
  const left = slide.blocks.filter((b) => !b.hints.includes("right"));
  const right = slide.blocks.filter((b) => b.hints.includes("right"));
  const colW = (W - MARGIN * 2 - 0.6) / 2;
  placeColumn(s, left, flat, o, { x: MARGIN, w: colW });
  placeColumn(s, right, flat, o, { x: MARGIN + colW + 0.6, w: colW });
}

function placeColumn(
  s: ReturnType<Pptx["addSlide"]>,
  blocks: Block[],
  flat: ReturnType<typeof flattenTheme>,
  o: { headingColor: string; fg: string },
  box: { x: number; w: number },
) {
  // An image block becomes a picture; otherwise text.
  const image = blocks.find((b) => b.type === "image");
  if (image) {
    const url = imageUrl(image.md);
    const source = url ? imageSource(url) : null;
    if (source) {
      s.addImage({ ...source, x: box.x, y: 1.6, w: box.w, h: 4.2, sizing: { type: "contain", w: box.w, h: 4.2 } });
    }
    const textBlocks = blocks.filter((b) => b !== image);
    if (textBlocks.length) addColumnText(s, textBlocks, flat, o, box);
    return;
  }
  addColumnText(s, blocks, flat, o, box);
}

function addColumnText(
  s: ReturnType<Pptx["addSlide"]>,
  blocks: Block[],
  flat: ReturnType<typeof flattenTheme>,
  o: { headingColor: string; fg: string },
  box: { x: number; w: number },
) {
  const heading = blocks.find((b) => b.type === "heading");
  const body = blocks.filter((b) => b !== heading);
  let y = MARGIN;
  if (heading) {
    s.addText(plain(heading.md), {
      x: box.x, y, w: box.w, h: 1.0,
      fontSize: 26, bold: true, color: o.headingColor, fontFace: flat.headingFont,
    });
    y += 1.2;
  }
  addBodyRegion(s, body, flat, o.fg, { x: box.x, y, w: box.w, h: H - y - 0.4 });
}

/** Render a set of body blocks (lists, paragraphs, quotes) as one text box. */
function addBodyRegion(
  s: ReturnType<Pptx["addSlide"]>,
  blocks: Block[],
  flat: ReturnType<typeof flattenTheme>,
  fg: string,
  box: { x: number; y: number; w: number; h: number },
) {
  const runs: TextRun[] = [];
  for (const b of blocks) {
    if (b.type === "list") {
      for (const item of listItems(b.md)) {
        runs.push({
          text: item,
          options: {
            fontSize: 18, color: colorFor(b, fg), fontFace: flat.bodyFont,
            bullet: { indent: 18 }, breakLine: true,
          },
        });
      }
    } else if (b.type === "image") {
      const url = imageUrl(b.md);
      const source = url ? imageSource(url) : null;
      if (source) s.addImage({ ...source, x: box.x, y: box.y, w: box.w, h: box.h, sizing: { type: "contain", w: box.w, h: box.h } });
    } else {
      runs.push({
        text: plain(b.md),
        options: {
          fontSize: b.type === "quote" ? 20 : 18,
          italic: b.type === "quote",
          color: colorFor(b, fg),
          fontFace: flat.bodyFont,
          breakLine: true,
          paraSpaceAfter: 6,
        },
      });
    }
  }
  if (runs.length) {
    s.addText(runs as never, { ...box, valign: "top", align: "left" });
  }
}

// --- helpers ---------------------------------------------------------------

/** Map a block's colour hint to a hex, else the default fg. */
function colorFor(block: Block, fg: string): string {
  const map: Record<string, string> = {
    muted: "6B7280", accent: "2543B9", primary: "2543B9",
    success: "16A34A", warning: "D97706", danger: "DC2626",
  };
  const c = block.hints.find((h) => h in map);
  return c ? map[c] : stripHash(fg) ?? "000000";
}

/** Strip markdown to plain text (keep it readable; PPTX runs are simple). */
function plain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/:([a-z][a-z0-9_-]*):/g, "") // :icon: tokens (no glyphs in pptx text)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/^#+\s*/, "")
    .trim();
}

function listItems(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.replace(/^\s*[-*+]\s+/, "").trim())
    .filter(Boolean)
    .map(plain);
}

function imageUrl(md: string): string | null {
  const m = md.match(/!\[[^\]]*\]\(([^)]*)\)/);
  if (!m) return null;
  // Locally-picked images resolve to an embeddable data URL; else use as-is.
  return RESOLVE_IMAGE?.(m[1]) ?? m[1];
}

/** pptxgenjs image source: a data URL must be passed as `data`, a real
 *  path/URL as `path`. Passing a data URL as `path` throws ENAMETOOLONG.
 *  Returns null for SVG sources (PowerPoint can't render SVG; these should
 *  have been rasterized in the pre-pass — if not, skip rather than embed). */
function imageSource(url: string): { data: string } | { path: string } | null {
  if (isSvgSource(url)) return null;
  return /^data:/i.test(url) ? { data: url } : { path: url };
}

function hex(color: string): string {
  return stripHash(color) ?? "FFFFFF";
}

function stripHash(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const m = color.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return m ? m[1].toUpperCase() : undefined;
}

function isDark(color: string): boolean {
  const h = stripHash(color);
  if (!h) return false;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}
