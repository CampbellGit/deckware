/**
 * The `.slide` parser. Source text -> Deck IR.
 *
 * Pipeline per file:
 *   1. Split front matter from slides; split slides on lines of `---`.
 *   2. For each slide: peel off a ```layout block and ??? speaker notes.
 *   3. Lex the remaining markdown into tokens (via `marked`).
 *   4. Convert tokens into semantic Blocks, extracting trailing {.hint}s.
 *
 * Errors are collected, never thrown: a malformed deck still renders what it
 * can. Warnings (e.g. unknown hints) surface for the editor to display.
 */
import { Lexer, parseInline, parse as parseMd } from "marked";
import type { Token } from "marked";
import { expandIcons } from "./icons";
import {
  type Block,
  type Deck,
  type DeckMeta,
  type Hint,
  type Slide,
  type SlideLayout,
  KNOWN_HINTS,
} from "./ir";

export interface ParseWarning {
  slide: number; // 1-based slide index, 0 for deck-level
  message: string;
}

export interface ParseResult {
  deck: Deck;
  warnings: ParseWarning[];
}

const DEFAULT_META: DeckMeta = { theme: "minimal", aspect: "16:9" };

/** Matches a trailing hint group like `{.left .half}` at end of a line. */
const HINT_RE = /\s*\{([^}]*)\}\s*$/;

export function parse(source: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const { frontMatter, body } = splitFrontMatter(source);
  const meta = parseFrontMatter(frontMatter);

  const slideSources = splitSlides(body);
  const slides: Slide[] = slideSources.map((src, i) =>
    parseSlide(src, i + 1, warnings),
  );

  return { deck: { meta, slides }, warnings };
}

/** Separate leading front matter from the slide body. */
function splitFrontMatter(source: string): {
  frontMatter: string;
  body: string;
} {
  // The first `---` line terminates the front matter, but only if there is
  // real key:value content before it (otherwise the doc just starts on slide 1).
  const lines = source.split("\n");
  let sep = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      sep = i;
      break;
    }
    // A non-empty, non key:value line before any --- means there is no
    // front matter; bail out.
    const l = lines[i].trim();
    if (l && !/^[\w-]+\s*:/.test(l)) {
      return { frontMatter: "", body: source };
    }
  }
  if (sep === -1) return { frontMatter: "", body: source };
  return {
    frontMatter: lines.slice(0, sep).join("\n"),
    body: lines.slice(sep + 1).join("\n"),
  };
}

function parseFrontMatter(text: string): DeckMeta {
  const meta: DeckMeta = { ...DEFAULT_META };
  for (const line of text.split("\n")) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return meta;
}

/** Split the body into per-slide source strings on lines of exactly `---`. */
function splitSlides(body: string): string[] {
  const slides: string[] = [];
  let current: string[] = [];
  for (const line of body.split("\n")) {
    if (line.trim() === "---") {
      slides.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  slides.push(current.join("\n"));
  // Drop slides that are entirely empty (e.g. a trailing `---`).
  const nonEmpty = slides.filter((s) => s.trim() !== "");
  return nonEmpty.length ? nonEmpty : [""];
}

function parseSlide(
  src: string,
  index: number,
  warnings: ParseWarning[],
): Slide {
  const { layout, rest: afterLayout } = extractLayout(src);
  const { notes, rest } = extractNotes(afterLayout);
  const blocks = parseBlocks(rest, index, warnings);
  return { layout, blocks, notes };
}

/** Peel a leading ```layout fenced block off the slide source. */
function extractLayout(src: string): { layout: SlideLayout; rest: string } {
  const trimmed = src.replace(/^\n+/, "");
  const fence = trimmed.match(/^```layout\n([\s\S]*?)\n```/);
  if (!fence) {
    return { layout: { name: "default" }, rest: src };
  }
  const layout: SlideLayout = { name: "default" };
  for (const line of fence[1].split("\n")) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (m) layout[m[1]] = m[2].trim();
  }
  if (!layout.name) layout.name = "default";
  return { layout, rest: trimmed.slice(fence[0].length) };
}

/** Pull ??? speaker-note lines out of the slide source. */
function extractNotes(src: string): { notes?: string; rest: string } {
  const noteLines: string[] = [];
  const keptLines: string[] = [];
  let inNotes = false;
  for (const line of src.split("\n")) {
    if (line.trimStart().startsWith("???")) {
      inNotes = true;
      noteLines.push(line.trimStart().replace(/^\?\?\?\s?/, ""));
    } else if (inNotes && line.trim() !== "" && line.startsWith(" ")) {
      noteLines.push(line);
    } else {
      inNotes = false;
      keptLines.push(line);
    }
  }
  const notes = noteLines.join("\n").trim();
  return { notes: notes || undefined, rest: keptLines.join("\n") };
}

/** Lex markdown and convert tokens into semantic Blocks. */
function parseBlocks(
  src: string,
  index: number,
  warnings: ParseWarning[],
): Block[] {
  const tokens = new Lexer().lex(src);
  const blocks: Block[] = [];
  for (const token of tokens) {
    const block = tokenToBlock(token, index, warnings);
    if (block) {
      // Expand :icon: tokens in the rendered HTML only — `md` stays clean so
      // the source round-trips and remains human/LLM-readable.
      block.html = expandIcons(block.html);
      blocks.push(block);
    }
  }
  return blocks;
}

function tokenToBlock(
  token: Token,
  index: number,
  warnings: ParseWarning[],
): Block | null {
  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const { text, hints } = extractHints(token.text, index, warnings);
      return {
        type: "heading",
        level: token.depth,
        md: text,
        html: parseInline(text) as string,
        hints,
      };
    }
    case "paragraph": {
      const { text, hints } = extractHints(token.text, index, warnings);
      // A paragraph that is *only* an image (after hints are stripped)
      // becomes an image block, so layouts can treat it as a figure.
      const imageOnly = /^!\[[^\]]*\]\([^)]*\)$/.test(text.trim());
      return {
        type: imageOnly ? "image" : "paragraph",
        md: text,
        html: parseInline(text) as string,
        hints,
      };
    }
    case "list": {
      // Hints on a list are per-item: each `- item {.hint}` styles its own
      // <li>. We do NOT strip a block-level trailing hint here, because that
      // would steal the last item's hint. Render first, then apply per item.
      const md = token.raw.trimEnd();
      const html = applyListItemHints(parseMd(md) as string, index, warnings);
      return { type: "list", md, html, hints: [] };
    }
    case "blockquote": {
      const { text, hints } = extractHints(token.raw.trimEnd(), index, warnings);
      // Strip the leading "> " markers for the stored markdown body so the
      // renderer and serializer share one representation.
      const body = text.replace(/^>\s?/gm, "");
      return {
        type: "quote",
        md: body,
        html: parseMd(body) as string,
        hints,
      };
    }
    case "code":
      return {
        type: "code",
        md: token.text,
        html: `<pre><code>${escapeHtml(token.text)}</code></pre>`,
        hints: [],
      };
    case "table":
      return {
        type: "table",
        md: token.raw.trimEnd(),
        html: parseMd(token.raw) as string,
        hints: [],
      };
    case "hr":
      return { type: "rule", md: "***", html: "", hints: [] };
    case "html":
      return { type: "html", md: token.raw.trimEnd(), html: token.raw, hints: [] };
    default: {
      // Anything else: render with the default markdown parser as a fallback.
      const raw = "raw" in token ? (token.raw as string) : "";
      if (!raw.trim()) return null;
      return {
        type: "paragraph",
        md: raw.trim(),
        html: parseMd(raw) as string,
        hints: [],
      };
    }
  }
}

/** Extract a trailing `{.a .b}` hint group from a block's text. */
function extractHints(
  text: string,
  index: number,
  warnings: ParseWarning[],
): { text: string; hints: Hint[] } {
  const m = text.match(HINT_RE);
  if (!m) return { text, hints: [] };
  const hints: Hint[] = [];
  for (const raw of m[1].split(/\s+/)) {
    const tok = raw.replace(/^\./, "").trim();
    if (!tok) continue;
    if (KNOWN_HINTS.has(tok)) {
      hints.push(tok as Hint);
    } else {
      warnings.push({ slide: index, message: `Unknown hint "{.${tok}}"` });
    }
  }
  return { text: text.slice(0, m.index).trimEnd(), hints };
}

/** A whole list item `<li>…{.hints}</li>` with a trailing hint group. The
 *  inner part excludes `<` before the hint group so it can't span across the
 *  item's own `</li>` into the next item. */
const LI_HINT_RE = /<li>([^<]*(?:<(?!\/li>)[^<]*)*?)\s*\{([^}]*)\}\s*<\/li>/g;

/**
 * Apply per-item hints: an item ending in `{.hint}` gets those hints as
 * `h-<hint>` classes on its <li>, and the marker is removed from the text.
 * Runs on the already-rendered list HTML so it works for any markdown list.
 */
function applyListItemHints(
  html: string,
  index: number,
  warnings: ParseWarning[],
): string {
  return html.replace(LI_HINT_RE, (_whole, inner: string, group: string) => {
    const classes: string[] = [];
    for (const raw of group.split(/\s+/)) {
      const tok = raw.replace(/^\./, "").trim();
      if (!tok) continue;
      if (KNOWN_HINTS.has(tok)) classes.push(`h-${tok}`);
      else warnings.push({ slide: index, message: `Unknown hint "{.${tok}}"` });
    }
    // The marker is always removed from the visible text; only valid hints
    // become classes.
    const body = inner.trim();
    return classes.length
      ? `<li class="${classes.join(" ")}">${body}</li>`
      : `<li>${body}</li>`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
