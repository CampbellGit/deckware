import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parse } from "./parse";
import { exportPptx } from "./export-pptx";

const DECK = `title: T
theme: indigo
---
\`\`\`layout
name: title
\`\`\`
# indigo Partners
## Conseil {.muted}
---
## Bullets
- one
- two
---
\`\`\`layout
name: section
bg: #00003b
\`\`\`
# Merci`;

async function slideXml(pptx: Blob, n: number): Promise<string> {
  const zip = await JSZip.loadAsync(await pptx.arrayBuffer());
  return zip.file(`ppt/slides/slide${n}.xml`)!.async("string");
}

describe("exportPptx", () => {
  it("produces a valid (unzippable) OOXML package with one slide per deck slide", async () => {
    const blob = await exportPptx(parse(DECK).deck);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slides = Object.keys(zip.files).filter((f) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(f),
    );
    expect(slides).toHaveLength(3);
    expect(zip.file("[Content_Types].xml")).toBeTruthy();
  });

  it("writes title text with the theme heading font and brand colour", async () => {
    const blob = await exportPptx(parse(DECK).deck);
    const xml = await slideXml(blob, 1);
    expect(xml).toContain("indigo Partners");
    expect(xml).toContain("Josefin Sans");
    expect(xml).toContain("3949D1"); // indigo accent
  });

  it("renders list items as bulleted text", async () => {
    const blob = await exportPptx(parse(DECK).deck);
    const xml = await slideXml(blob, 2);
    expect(xml).toContain("one");
    expect(xml).toContain("two");
    expect(xml).toMatch(/buChar|buAutoNum|buNone|buFont|buSzPct|<a:buChar|buClr|<a:bu/);
  });

  it("applies a custom slide background colour with light text for contrast", async () => {
    const blob = await exportPptx(parse(DECK).deck);
    const xml = await slideXml(blob, 3);
    expect(xml).toContain("00003B"); // navy bg
    expect(xml).toContain("FFFFFF"); // white text
  });

  it("embeds a data-URL image background (must not be treated as a file path)", async () => {
    // Regression: pptxgenjs threw ENAMETOOLONG because a data URL was passed as
    // `path`. Data URLs must go through `data`. A 1x1 transparent PNG:
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const deck = parse(
      `theme: indigo\n---\n\`\`\`layout\nname: title\nbg: image(pic.png)\n\`\`\`\n# Hi`,
    ).deck;
    const blob = await exportPptx(deck, { resolveImage: () => png });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    // The image is embedded as a media part in the package.
    const media = Object.keys(zip.files).filter((f) =>
      /^ppt\/media\/.*\.(png|jpe?g)$/i.test(f),
    );
    expect(media.length).toBeGreaterThan(0);
  });

  it("rasterizes an SVG background to PNG (PowerPoint has no SVG support)", async () => {
    const svg =
      "data:image/svg+xml;base64," +
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64");
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const deck = parse(
      `theme: indigo\n---\n\`\`\`layout\nname: title\nbg: image(bg.svg)\n\`\`\`\n# Hi`,
    ).deck;
    let asked = "";
    const blob = await exportPptx(deck, {
      resolveImage: () => svg,
      rasterizeSvg: async (src) => {
        asked = src;
        return png;
      },
    });
    // The SVG source was handed to the rasterizer...
    expect(asked).toBe(svg);
    // ...and a PNG (not SVG) media part is embedded.
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const media = Object.keys(zip.files).filter((f) => /^ppt\/media\//.test(f));
    expect(media.some((f) => /\.png$/i.test(f))).toBe(true);
    expect(media.some((f) => /\.svg$/i.test(f))).toBe(false);
  });

  it("falls back to a solid background when an SVG can't be rasterized", async () => {
    const svg =
      "data:image/svg+xml;base64," +
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64");
    const deck = parse(
      `theme: indigo\n---\n\`\`\`layout\nname: title\nbg: image(bg.svg)\n\`\`\`\n# Hi`,
    ).deck;
    // No rasterizeSvg hook → the SVG must NOT be embedded as (unreadable) bytes.
    const blob = await exportPptx(deck, { resolveImage: () => svg });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const media = Object.keys(zip.files).filter((f) => /^ppt\/media\/.+/.test(f));
    expect(media).toHaveLength(0);
  });
});
