/**
 * Deck IR — the intermediate representation.
 *
 * This is the stable contract between the parser and every renderer
 * (live preview, self-contained HTML, PDF). Parsers produce a `Deck`;
 * renderers consume one. Nothing downstream should ever re-parse `.slide`
 * source — the IR is the single source of truth.
 */

/** Deck-level configuration from the front matter. */
export interface DeckMeta {
  /** Theme name. Resolved against the built-in theme registry. */
  theme: string;
  /** Aspect ratio, e.g. "16:9" or "4:3". */
  aspect: string;
  /** Optional deck title (used for exported file names, <title>). */
  title?: string;
  /** Any extra front-matter keys, preserved verbatim. */
  [key: string]: string | undefined;
}

/**
 * Layout hints attached to a content block.
 *
 * Hints are the *tight vocabulary* that nudges auto-flowed content. They are
 * intentionally a closed set of tokens, not arbitrary CSS — that constraint is
 * what keeps decks predictable for an LLM to write and consistent to look at.
 */
export type Hint =
  // Sizing
  | "small" | "large" | "huge"
  // Horizontal placement / width
  | "left" | "right" | "center"
  | "half" | "third" | "two-thirds" | "full"
  // Emphasis / role
  | "muted" | "accent"
  // Named colour tokens (resolved to theme palette vars)
  | "primary" | "success" | "warning" | "danger"
  // Flow control
  | "fill"; // grow to fill remaining vertical space

/** Colour hint tokens — the subset of hints that set text colour. */
export const COLOR_HINTS = [
  "muted", "accent", "primary", "success", "warning", "danger",
] as const;
export type ColorHint = (typeof COLOR_HINTS)[number];

/** Size hint tokens, smallest to largest, with the implicit base. */
export const SIZE_HINTS = ["small", "large", "huge"] as const;
export type SizeHint = (typeof SIZE_HINTS)[number];

/** A single piece of slide content, produced by auto-flow parsing. */
export interface Block {
  /** Semantic kind — drives default styling and layout role. */
  type: BlockType;
  /**
   * Raw markdown source for this block, with the trailing {.hint} group
   * stripped. This is what makes the IR round-trippable: the serializer
   * re-emits `md` + hints, so the editor and inspector stay in sync.
   */
  md: string;
  /** Rendered inner HTML for this block (markdown already converted). */
  html: string;
  /** Layout hints applied to this block. */
  hints: Hint[];
  /** For headings: the level (1–6). Undefined otherwise. */
  level?: number;
}

export type BlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "image"
  | "code"
  | "quote"
  | "table"
  | "rule"
  | "html"; // raw passthrough — discouraged, but parsed for resilience

/** Options declared in a slide's ```layout block. */
export interface SlideLayout {
  /** Named layout template, e.g. "default", "title", "two-up". */
  name: string;
  /** Vertical alignment of content within the slide. */
  align?: "top" | "center" | "bottom";
  /** Content alignment shorthand passed to the template. */
  [key: string]: string | undefined;
}

export interface Slide {
  layout: SlideLayout;
  blocks: Block[];
  /** Slide-level notes (speaker notes), if any. */
  notes?: string;
}

export interface Deck {
  meta: DeckMeta;
  slides: Slide[];
}

/** The set of layout names the renderer knows how to lay out. */
export const KNOWN_LAYOUTS = [
  "default", // auto-flow, top-aligned
  "title", // centered title slide
  "section", // section divider, big centered heading
  "two-up", // two columns side by side
  "quote", // large centered quotation
] as const;
export type KnownLayout = (typeof KNOWN_LAYOUTS)[number];

/** The closed set of valid hint tokens, for validation. */
export const KNOWN_HINTS: ReadonlySet<string> = new Set<Hint>([
  "small", "large", "huge",
  "left", "right", "center",
  "half", "third", "two-thirds", "full",
  "muted", "accent", "primary", "success", "warning", "danger",
  "fill",
]);
