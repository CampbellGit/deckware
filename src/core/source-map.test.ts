import { describe, it, expect } from "vitest";
import { slideRanges, slideAtLine } from "./source-map";
import { parse } from "./parse";

describe("slideRanges", () => {
  it("aligns range count with the parser's slide count", () => {
    const src = `theme: minimal\n---\n# A\n---\n# B\n---\n# C`;
    expect(slideRanges(src)).toHaveLength(parse(src).deck.slides.length);
  });

  it("handles a document with no front matter", () => {
    const src = `# One\n---\n# Two`;
    const r = slideRanges(src);
    expect(r).toHaveLength(2);
    expect(r[0].start).toBe(0);
  });

  it("drops empty slides from a trailing separator (stays aligned)", () => {
    const src = `theme: minimal\n---\n# A\n---\n`;
    expect(slideRanges(src)).toHaveLength(parse(src).deck.slides.length);
  });
});

describe("slideAtLine", () => {
  const src = `theme: minimal\n---\n# A\nbody a\n---\n# B\nbody b`;
  // lines: 0 theme, 1 ---, 2 #A, 3 body a, 4 ---, 5 #B, 6 body b

  it("maps a content line to its slide", () => {
    expect(slideAtLine(src, 2)).toBe(0);
    expect(slideAtLine(src, 3)).toBe(0);
    expect(slideAtLine(src, 5)).toBe(1);
    expect(slideAtLine(src, 6)).toBe(1);
  });

  it("attributes a separator line to the preceding slide", () => {
    expect(slideAtLine(src, 4)).toBe(0);
  });

  it("never returns out of range", () => {
    expect(slideAtLine(src, 999)).toBe(1);
    expect(slideAtLine(src, 0)).toBeGreaterThanOrEqual(0);
  });
});
