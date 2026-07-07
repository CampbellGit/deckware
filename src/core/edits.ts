/**
 * Pure IR editing operations used by the inspector. Each returns a new Deck
 * (immutable update) so React state changes are clean and undoable. The app
 * serializes the result back to `.slide` text — the text stays canonical.
 */
import {
  type Deck,
  type Hint,
  type Block,
  COLOR_HINTS,
  SIZE_HINTS,
} from "./ir";

type Mutator<T> = (value: T) => T;

function mapSlide(deck: Deck, slide: number, fn: Mutator<Deck["slides"][number]>): Deck {
  return {
    ...deck,
    slides: deck.slides.map((s, i) => (i === slide ? fn(s) : s)),
  };
}

function mapBlock(
  deck: Deck,
  slide: number,
  block: number,
  fn: Mutator<Block>,
): Deck {
  return mapSlide(deck, slide, (s) => ({
    ...s,
    blocks: s.blocks.map((b, i) => (i === block ? fn(b) : b)),
  }));
}

/** Replace every hint from a mutually-exclusive group with `next` (or none). */
function setExclusive(
  hints: Hint[],
  group: readonly string[],
  next: Hint | null,
): Hint[] {
  const kept = hints.filter((h) => !group.includes(h));
  return next ? [...kept, next] : kept;
}

// --- Block-level edits ---------------------------------------------------

export function setSize(
  deck: Deck,
  slide: number,
  block: number,
  size: (typeof SIZE_HINTS)[number] | null,
): Deck {
  return mapBlock(deck, slide, block, (b) => ({
    ...b,
    hints: setExclusive(b.hints, SIZE_HINTS, size),
  }));
}

export function setColor(
  deck: Deck,
  slide: number,
  block: number,
  color: (typeof COLOR_HINTS)[number] | null,
): Deck {
  return mapBlock(deck, slide, block, (b) => ({
    ...b,
    hints: setExclusive(b.hints, COLOR_HINTS, color),
  }));
}

const ALIGN_HINTS = ["left", "center", "right"] as const;
export function setAlign(
  deck: Deck,
  slide: number,
  block: number,
  align: (typeof ALIGN_HINTS)[number] | null,
): Deck {
  return mapBlock(deck, slide, block, (b) => ({
    ...b,
    hints: setExclusive(b.hints, ALIGN_HINTS, align),
  }));
}

const WIDTH_HINTS = ["half", "third", "two-thirds", "full"] as const;
export function setWidth(
  deck: Deck,
  slide: number,
  block: number,
  width: (typeof WIDTH_HINTS)[number] | null,
): Deck {
  return mapBlock(deck, slide, block, (b) => ({
    ...b,
    hints: setExclusive(b.hints, WIDTH_HINTS, width),
  }));
}

/** Toggle a standalone boolean hint (e.g. `fill`). */
export function toggleHint(
  deck: Deck,
  slide: number,
  block: number,
  hint: Hint,
): Deck {
  return mapBlock(deck, slide, block, (b) => ({
    ...b,
    hints: b.hints.includes(hint)
      ? b.hints.filter((h) => h !== hint)
      : [...b.hints, hint],
  }));
}

/** Move a block within its slide by `delta` (e.g. -1 up, +1 down). */
export function moveBlock(
  deck: Deck,
  slide: number,
  from: number,
  delta: number,
): Deck {
  return mapSlide(deck, slide, (s) => {
    const to = from + delta;
    if (to < 0 || to >= s.blocks.length) return s;
    const blocks = [...s.blocks];
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    return { ...s, blocks };
  });
}

/** Reorder a block to an absolute index (for drag-and-drop). */
export function reorderBlock(
  deck: Deck,
  slide: number,
  from: number,
  to: number,
): Deck {
  return mapSlide(deck, slide, (s) => {
    if (to < 0 || to >= s.blocks.length || from === to) return s;
    const blocks = [...s.blocks];
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    return { ...s, blocks };
  });
}

// --- Slide-level edits ---------------------------------------------------

export function setLayout(deck: Deck, slide: number, name: string): Deck {
  return mapSlide(deck, slide, (s) => ({
    ...s,
    layout: { ...s.layout, name },
  }));
}

/** Set or clear a slide's background. `value` is a raw bg string, e.g.
 *  "#0f1115", "accent", or "image(hero.jpg)". null removes it. */
export function setSlideBg(
  deck: Deck,
  slide: number,
  value: string | null,
): Deck {
  return mapSlide(deck, slide, (s) => {
    const layout = { ...s.layout };
    if (value) layout.bg = value;
    else {
      delete layout.bg;
      delete layout["bg-fit"];
      delete layout["bg-dim"];
    }
    return { ...s, layout };
  });
}

/** Set or clear a background modifier (`bg-fit` or `bg-dim`) on a slide. */
export function setSlideBgOption(
  deck: Deck,
  slide: number,
  key: "bg-fit" | "bg-dim",
  value: string | null,
): Deck {
  return mapSlide(deck, slide, (s) => {
    const layout = { ...s.layout };
    if (value != null && value !== "") layout[key] = value;
    else delete layout[key];
    return { ...s, layout };
  });
}

export function setSlideAlign(
  deck: Deck,
  slide: number,
  align: "top" | "center" | "bottom" | null,
): Deck {
  return mapSlide(deck, slide, (s) => {
    const layout = { ...s.layout };
    if (align) layout.align = align;
    else delete layout.align;
    return { ...s, layout };
  });
}

// --- Deck-level edits ----------------------------------------------------

export function setTheme(deck: Deck, theme: string): Deck {
  return { ...deck, meta: { ...deck.meta, theme } };
}
