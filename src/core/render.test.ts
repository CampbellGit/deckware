import { describe, it, expect } from "vitest";
import { parse } from "./parse";
import { deckStylesheet, renderSlides } from "./render";

function render(src: string) {
  return renderSlides(parse(src).deck);
}

describe("renderSlides", () => {
  it("emits one rendered slide per slide with layout + align classes", () => {
    const slides = render(
      `theme: minimal\n---\n\`\`\`layout\nname: title\n\`\`\`\n# Hi`,
    );
    expect(slides).toHaveLength(1);
    expect(slides[0].html).toContain('class="slide layout-title align-center"');
  });

  it("defaults the default layout to vertically-centred (middle) alignment", () => {
    // Content slides centre vertically so the slide is "present" rather than
    // hugging the top edge; text stays left-aligned.
    const [s] = render(`theme: minimal\n---\n# Hi`);
    expect(s.html).toContain("layout-default");
    expect(s.html).toContain("align-middle");
  });

  it("renders headings at the correct level", () => {
    const [s] = render(`theme: minimal\n---\n### Sub`);
    expect(s.html).toContain("<h3");
  });

  it("applies hint classes as h-<hint>", () => {
    const [s] = render(`theme: minimal\n---\n## T {.large .accent}`);
    expect(s.html).toContain("h-large");
    expect(s.html).toContain("h-accent");
  });

  it("wraps images in a figure", () => {
    const [s] = render(`theme: minimal\n---\n![c](c.png)`);
    expect(s.html).toContain("<figure");
    expect(s.html).toContain("<img");
  });

  it("carries speaker notes through to the rendered slide", () => {
    const [s] = render(`theme: minimal\n---\n# Hi\n\n??? a note`);
    expect(s.notes).toBe("a note");
  });

  it("overrides heading colour (not just fg) on a dark background", () => {
    // Regression: a themed heading colour (e.g. indigo brand accent) is
    // unreadable on a dark slide bg unless --color-heading is overridden too.
    const [s] = render(
      `theme: indigo\n---\n\`\`\`layout\nname: section\nbg: #00003b\n\`\`\`\n# Merci`,
    );
    expect(s.html).toContain("--color-heading: #ffffff;");
    expect(s.html).toContain("--color-fg: #ffffff;");
  });

  it("does not override heading colour when there is no background", () => {
    const [s] = render(`theme: indigo\n---\n# Hi`);
    expect(s.html).not.toContain("--color-heading:");
  });

  it("lifts accent + muted colours over a dimmed photo so links/subtitles stay legible", () => {
    // Regression: an email link (accent) and a {.muted} subtitle were brand
    // blue / grey and unreadable on a dark photo until accent/muted were
    // overridden alongside fg.
    const [s] = render(
      `theme: indigo\n---\n\`\`\`layout\nname: title\nbg: image(x.jpg)\nbg-dim: 0.55\n\`\`\`\n# Hi`,
    );
    expect(s.html).toContain("--color-accent: #ffffff;");
    expect(s.html).toContain("--color-muted: rgba(255,255,255,0.75);");
  });
});

describe("two-up routing", () => {
  it("routes right-hinted blocks into the second column", () => {
    const [s] = render(
      `theme: minimal\n---\n\`\`\`layout\nname: two-up\n\`\`\`\n## Left\n\nRight text {.right}`,
    );
    const cols = s.html.match(/<div class="col">/g) ?? [];
    expect(cols).toHaveLength(2);
    // Left column comes first and holds the heading.
    const firstCol = s.html.indexOf('<div class="col">');
    const heading = s.html.indexOf("Left");
    const rightText = s.html.indexOf("Right text");
    expect(firstCol).toBeLessThan(heading);
    expect(heading).toBeLessThan(rightText);
  });
});

describe("deckStylesheet", () => {
  it("encodes the aspect ratio from front matter", () => {
    const sheet = deckStylesheet(parse(`aspect: 4:3\n---\n# Hi`).deck);
    expect(sheet).toContain("--aspect-w: 4");
    expect(sheet).toContain("--aspect-h: 3");
    expect(sheet).toContain("aspect-ratio: 4 / 3");
  });

  it("defaults to 16:9 for a malformed aspect", () => {
    const sheet = deckStylesheet(parse(`aspect: garbage\n---\n# Hi`).deck);
    expect(sheet).toContain("aspect-ratio: 16 / 9");
  });

  it("inlines theme custom properties", () => {
    const sheet = deckStylesheet(parse(`theme: ink\n---\n# Hi`).deck);
    expect(sheet).toContain("--color-bg: #0f1115");
  });

  it("sizes the slide via container-query units (no viewport/JS hack)", () => {
    // Regression: type must scale to the slide box itself so preview and
    // export match. Uses `inline-size` (width) — `size` needs an explicit
    // height the aspect-ratio-only slide can't give, so cqh drifted between
    // the preview and the full-screen player. Width-derived units resolve
    // identically. Padding lives on .slide-content, never the container.
    const sheet = deckStylesheet(parse(`theme: minimal\n---\n# Hi`).deck);
    expect(sheet).toContain("container-type: inline-size");
    expect(sheet).toContain("cqw");
    expect(sheet).not.toContain("--slide-h");
    // The container itself must not carry cqw padding (would skew its own
    // inline-size); it belongs on the inner content box.
    expect(sheet).toMatch(/\.slide-content\s*\{[^}]*padding:/);
  });

  it("cascades size hints into inner p/blockquote/li", () => {
    // Regression: {.huge} on a quote/list wrapper must reach the inner text,
    // which otherwise picks up the base font-size rule.
    const sheet = deckStylesheet(parse(`theme: minimal\n---\n# Hi`).deck);
    expect(sheet).toContain(".h-huge :is(p, blockquote, li)");
  });
});
