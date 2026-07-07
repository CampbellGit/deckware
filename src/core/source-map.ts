/**
 * Source ↔ slide mapping.
 *
 * The editor and the scrolling preview stay in sync by translating a source
 * line number into the slide it belongs to (and back). This mirrors the
 * parser's slide-splitting rules (front matter, then `---` separators, dropping
 * fully-empty slides) so the indices line up with `parse().deck.slides`.
 */

export interface SlideRange {
  /** First source line of the slide (0-based, inclusive). */
  start: number;
  /** One past the slide's last source line (exclusive) — the separator line. */
  end: number;
}

/** Find the first body line, skipping any `key: value` front matter block. */
function bodyStart(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === "---") return i + 1; // front-matter terminator
    // A non-empty, non key:value line before any `---` ⇒ no front matter.
    if (l && !/^[\w-]+\s*:/.test(l)) return 0;
  }
  return 0;
}

/**
 * Line ranges for each slide, aligned with `parse()`'s slide list (empty
 * slides dropped). Returns at least one range for a non-trivial document.
 */
export function slideRanges(source: string): SlideRange[] {
  const lines = source.split("\n");
  const start0 = bodyStart(lines);
  const raw: SlideRange[] = [];
  let curStart = start0;
  for (let i = start0; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      raw.push({ start: curStart, end: i });
      curStart = i + 1;
    }
  }
  raw.push({ start: curStart, end: lines.length });

  // Drop fully-empty slides, exactly as splitSlides does, so indices match.
  const kept = raw.filter(
    (r) => lines.slice(r.start, r.end).join("\n").trim() !== "",
  );
  return kept.length ? kept : [{ start: start0, end: lines.length }];
}

/**
 * The slide index that a given (0-based) source line belongs to. A line on a
 * separator (or inside a dropped empty slide) is attributed to the nearest
 * preceding slide. Always returns a valid index for a non-empty deck.
 */
export function slideAtLine(source: string, line: number): number {
  const ranges = slideRanges(source);
  for (let i = 0; i < ranges.length; i++) {
    if (line >= ranges[i].start && line < ranges[i].end) return i;
  }
  // Not strictly inside a range (e.g. on a `---`): take the last slide whose
  // content starts at or before this line.
  let best = 0;
  for (let i = 0; i < ranges.length; i++) {
    if (ranges[i].start <= line) best = i;
  }
  return best;
}
