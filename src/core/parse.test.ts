import { describe, it, expect } from "vitest";
import { parse } from "./parse";

describe("markdown compatibility (.slide is a Markdown superset)", () => {
  it("parses a plain Markdown document (no deckware features) into slides", () => {
    const md = `# Title\n\nIntro text.\n\n---\n\n## Second\n\n- a\n- b\n`;
    const { deck, warnings } = parse(md);
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0].blocks.map((b) => b.type)).toEqual(["heading", "paragraph"]);
    expect(deck.slides[1].blocks.map((b) => b.type)).toEqual(["heading", "list"]);
    expect(warnings).toEqual([]); // plain markdown yields no warnings
  });

  it("treats .md and .slide content identically (same bytes → same deck)", () => {
    const content = `theme: minimal\n---\n# Hi {.large}\n- x {.success}`;
    // The parser is extension-agnostic; opening as .md or .slide is the same call.
    expect(parse(content)).toEqual(parse(content));
  });
});

describe("front matter", () => {
  it("parses key:value lines and applies defaults", () => {
    const { deck } = parse(`title: My Deck\ntheme: ink\n---\n# Hi`);
    expect(deck.meta.title).toBe("My Deck");
    expect(deck.meta.theme).toBe("ink");
    expect(deck.meta.aspect).toBe("16:9"); // default
  });

  it("falls back to defaults when there is no front matter", () => {
    const { deck } = parse(`# Just a heading`);
    expect(deck.meta.theme).toBe("minimal");
    expect(deck.meta.aspect).toBe("16:9");
    expect(deck.slides).toHaveLength(1);
  });

  it("does not treat a content-only doc's --- as a front-matter terminator", () => {
    // First line is content, not key:value → no front matter, --- splits slides.
    const { deck } = parse(`# One\n---\n# Two`);
    expect(deck.meta.title).toBeUndefined();
    expect(deck.slides).toHaveLength(2);
  });
});

describe("slide splitting", () => {
  it("splits on lines of exactly ---", () => {
    const { deck } = parse(`theme: minimal\n---\n# A\n---\n# B\n---\n# C`);
    expect(deck.slides).toHaveLength(3);
  });

  it("drops empty slides from trailing separators", () => {
    const { deck } = parse(`theme: minimal\n---\n# A\n---\n`);
    expect(deck.slides).toHaveLength(1);
  });

  it("always yields at least one slide", () => {
    const { deck } = parse("");
    expect(deck.slides).toHaveLength(1);
  });
});

describe("layout blocks", () => {
  it("parses a leading ```layout fence", () => {
    const { deck } = parse(
      `theme: minimal\n---\n\`\`\`layout\nname: two-up\nalign: center\n\`\`\`\n# Hi`,
    );
    expect(deck.slides[0].layout.name).toBe("two-up");
    expect(deck.slides[0].layout.align).toBe("center");
  });

  it("defaults to the default layout with no fence", () => {
    const { deck } = parse(`theme: minimal\n---\n# Hi`);
    expect(deck.slides[0].layout.name).toBe("default");
  });
});

describe("blocks and hints", () => {
  it("extracts known hints and strips them from the text", () => {
    const { deck, warnings } = parse(
      `theme: minimal\n---\n## Title {.large .accent}`,
    );
    const block = deck.slides[0].blocks[0];
    expect(block.type).toBe("heading");
    expect(block.level).toBe(2);
    expect(block.hints).toEqual(["large", "accent"]);
    expect(block.html).not.toContain("{");
    expect(warnings).toHaveLength(0);
  });

  it("warns on unknown hints but keeps the block", () => {
    const { deck, warnings } = parse(
      `theme: minimal\n---\n## Title {.bogus}`,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].slide).toBe(1);
    expect(warnings[0].message).toContain("bogus");
    expect(deck.slides[0].blocks[0].hints).toEqual([]);
  });

  it("detects an image-only paragraph as an image block", () => {
    const { deck } = parse(
      `theme: minimal\n---\n![c](c.png) {.right .half}`,
    );
    const block = deck.slides[0].blocks[0];
    expect(block.type).toBe("image");
    expect(block.hints).toEqual(["right", "half"]);
    expect(block.html).toContain("<img");
  });

  it("parses lists, quotes, and code as their own block types", () => {
    const { deck } = parse(
      `theme: minimal\n---\n- one\n- two\n\n> a quote\n\n\`\`\`\ncode\n\`\`\``,
    );
    const types = deck.slides[0].blocks.map((b) => b.type);
    expect(types).toContain("list");
    expect(types).toContain("quote");
    expect(types).toContain("code");
  });

  it("escapes HTML inside code blocks", () => {
    const { deck } = parse(
      `theme: minimal\n---\n\`\`\`\n<script>x</script>\n\`\`\``,
    );
    const code = deck.slides[0].blocks.find((b) => b.type === "code");
    expect(code?.html).toContain("&lt;script&gt;");
    expect(code?.html).not.toContain("<script>");
  });
});

describe("per-list-item hints", () => {
  it("applies a hint to the matching <li> only", () => {
    const { deck } = parse(
      `theme: minimal\n---\n- plain\n- danger one {.danger}\n- ok {.success}`,
    );
    const html = deck.slides[0].blocks[0].html;
    expect(html).toContain('<li class="h-danger">danger one</li>');
    expect(html).toContain('<li class="h-success">ok</li>');
    expect(html).toContain("<li>plain</li>");
  });

  it("strips the hint marker from the visible text", () => {
    const { deck } = parse(`theme: minimal\n---\n- item {.accent}`);
    expect(deck.slides[0].blocks[0].html).not.toContain("{.accent}");
  });

  it("applies the hint to the last item too (not as a block hint)", () => {
    const { deck } = parse(`theme: minimal\n---\n- only {.warning}`);
    expect(deck.slides[0].blocks[0].html).toContain('<li class="h-warning">');
    expect(deck.slides[0].blocks[0].hints).toEqual([]);
  });

  it("warns on an unknown per-item hint and leaves the item unstyled", () => {
    const { deck, warnings } = parse(`theme: minimal\n---\n- x {.nope}`);
    expect(warnings.some((w) => w.message.includes("nope"))).toBe(true);
    expect(deck.slides[0].blocks[0].html).toContain("<li>x</li>");
  });
});

describe("speaker notes", () => {
  it("extracts ??? notes and removes them from blocks", () => {
    const { deck } = parse(
      `theme: minimal\n---\n## Roadmap\n- ship v0\n\n??? Mention the slip.`,
    );
    expect(deck.slides[0].notes).toBe("Mention the slip.");
    const html = deck.slides[0].blocks.map((b) => b.html).join(" ");
    expect(html).not.toContain("Mention the slip");
  });

  it("leaves notes undefined when there are none", () => {
    const { deck } = parse(`theme: minimal\n---\n# Hi`);
    expect(deck.slides[0].notes).toBeUndefined();
  });
});
