import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "./parse";
import { serialize } from "./serialize";

/** parse → serialize → parse must be stable (same meaning). */
function roundTrip(src: string) {
  const first = parse(src).deck;
  const text = serialize(first);
  const second = parse(text).deck;
  return { first, second, text };
}

describe("round-trip stability", () => {
  const cases: Record<string, string> = {
    heading: `theme: minimal\n---\n# Title`,
    "hints on heading": `theme: minimal\n---\n## T {.large .accent}`,
    list: `theme: minimal\n---\n- one\n- two\n- three`,
    quote: `theme: minimal\n---\n> A claim. {.huge}`,
    "layout block": `theme: minimal\n---\n\`\`\`layout\nname: two-up\nalign: center\n\`\`\`\n## L\n\nR {.right}`,
    code: `theme: minimal\n---\n\`\`\`\nconst x = 1;\n\`\`\``,
    table: `theme: minimal\n---\n| A | B |\n| --- | --- |\n| 1 | 2 |`,
    notes: `theme: minimal\n---\n# Hi\n\n??? remember this`,
    image: `theme: minimal\n---\n![c](c.png) {.right .half}`,
    rule: `theme: minimal\n---\nabove\n\n***\n\nbelow`,
    "multi-slide": `title: D\ntheme: ink\n---\n# One\n---\n## Two\n- a\n- b`,
  };

  for (const [name, src] of Object.entries(cases)) {
    it(`is stable for: ${name}`, () => {
      const { first, second } = roundTrip(src);
      expect(second.meta).toEqual(first.meta);
      expect(second.slides.length).toBe(first.slides.length);
      first.slides.forEach((slide, i) => {
        expect(second.slides[i].layout).toEqual(slide.layout);
        expect(second.slides[i].notes).toEqual(slide.notes);
        expect(second.slides[i].blocks.map((b) => b.type)).toEqual(
          slide.blocks.map((b) => b.type),
        );
        expect(second.slides[i].blocks.map((b) => b.hints)).toEqual(
          slide.blocks.map((b) => b.hints),
        );
        expect(second.slides[i].blocks.map((b) => b.html)).toEqual(
          slide.blocks.map((b) => b.html),
        );
      });
    });
  }

  it("is stable for the migration-plan example deck", () => {
    const src = readFileSync(
      resolve(__dirname, "../../examples/migration-plan.slide"),
      "utf8",
    );
    const { first, second } = roundTrip(src);
    expect(second.slides.length).toBe(first.slides.length);
    first.slides.forEach((slide, i) => {
      expect(second.slides[i].layout).toEqual(slide.layout);
      expect(second.slides[i].blocks.map((b) => b.html)).toEqual(
        slide.blocks.map((b) => b.html),
      );
      expect(second.slides[i].blocks.map((b) => b.hints)).toEqual(
        slide.blocks.map((b) => b.hints),
      );
    });
  });

  it("drops the layout block for a plain default slide", () => {
    const text = serialize(parse(`theme: minimal\n---\n# Hi`).deck);
    expect(text).not.toContain("```layout");
  });

  it("serializes hr as *** so it doesn't collide with the slide separator", () => {
    const text = serialize(parse(`theme: minimal\n---\nx\n\n***\n\ny`).deck);
    // Exactly one slide-separating --- (after front matter), no --- for the rule.
    const separators = text.split("\n").filter((l) => l.trim() === "---");
    expect(separators).toHaveLength(1);
    expect(text).toContain("***");
  });
});

describe("columns round-trip", () => {
  it("re-emits ::: separators and stays stable", () => {
    const src = `theme: minimal\n---\n## Head\n:::\nleft\n:::\nright`;
    const once = serialize(parse(src).deck);
    expect(once).toContain(":::");
    expect(serialize(parse(once).deck)).toBe(once);
  });
});
