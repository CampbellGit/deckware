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
});
