import { describe, it, expect } from "vitest";
import { parse } from "./parse";
import { serialize } from "./serialize";
import * as edit from "./edits";

const DECK = `theme: minimal\n---\n## Heading\n- a\n- b\n\nA paragraph.`;
function deck() {
  return parse(DECK).deck;
}

describe("block edits", () => {
  it("sets a size hint and replaces a prior one (mutually exclusive)", () => {
    let d = edit.setSize(deck(), 0, 0, "large");
    expect(d.slides[0].blocks[0].hints).toContain("large");
    d = edit.setSize(d, 0, 0, "huge");
    expect(d.slides[0].blocks[0].hints).toContain("huge");
    expect(d.slides[0].blocks[0].hints).not.toContain("large");
  });

  it("clears a size hint with null", () => {
    let d = edit.setSize(deck(), 0, 0, "large");
    d = edit.setSize(d, 0, 0, null);
    expect(d.slides[0].blocks[0].hints).not.toContain("large");
  });

  it("sets a colour hint, exclusive within the palette", () => {
    let d = edit.setColor(deck(), 0, 0, "accent");
    expect(d.slides[0].blocks[0].hints).toContain("accent");
    d = edit.setColor(d, 0, 0, "danger");
    expect(d.slides[0].blocks[0].hints).toEqual(["danger"]);
  });

  it("keeps size and colour independent", () => {
    let d = edit.setSize(deck(), 0, 0, "large");
    d = edit.setColor(d, 0, 0, "accent");
    expect(d.slides[0].blocks[0].hints).toEqual(
      expect.arrayContaining(["large", "accent"]),
    );
  });

  it("does not mutate the input deck (immutability)", () => {
    const original = deck();
    edit.setSize(original, 0, 0, "huge");
    expect(original.slides[0].blocks[0].hints).toEqual([]);
  });

  it("moves a block within its slide", () => {
    const d = edit.moveBlock(deck(), 0, 0, +1);
    const types = d.slides[0].blocks.map((b) => b.type);
    expect(types).toEqual(["list", "heading", "paragraph"]);
  });

  it("is a no-op when moving past the edges", () => {
    const d = edit.moveBlock(deck(), 0, 0, -1);
    expect(d.slides[0].blocks.map((b) => b.type)).toEqual([
      "heading",
      "list",
      "paragraph",
    ]);
  });
});

describe("slide & deck edits", () => {
  it("changes the slide layout", () => {
    const d = edit.setLayout(deck(), 0, "two-up");
    expect(d.slides[0].layout.name).toBe("two-up");
  });

  it("sets and clears slide vertical align", () => {
    let d = edit.setSlideAlign(deck(), 0, "center");
    expect(d.slides[0].layout.align).toBe("center");
    d = edit.setSlideAlign(d, 0, null);
    expect(d.slides[0].layout.align).toBeUndefined();
  });

  it("changes the theme", () => {
    expect(edit.setTheme(deck(), "ink").meta.theme).toBe("ink");
  });

  it("sets and clears a slide background", () => {
    let d = edit.setSlideBg(deck(), 0, "#0f1115");
    expect(d.slides[0].layout.bg).toBe("#0f1115");
    d = edit.setSlideBg(d, 0, "image(hero.jpg)");
    expect(d.slides[0].layout.bg).toBe("image(hero.jpg)");
    d = edit.setSlideBg(d, 0, null);
    expect(d.slides[0].layout.bg).toBeUndefined();
  });

  it("clearing the background also clears its modifiers", () => {
    let d = edit.setSlideBg(deck(), 0, "image(x.jpg)");
    d = edit.setSlideBgOption(d, 0, "bg-dim", "0.5");
    d = edit.setSlideBgOption(d, 0, "bg-fit", "contain");
    d = edit.setSlideBg(d, 0, null);
    expect(d.slides[0].layout["bg-dim"]).toBeUndefined();
    expect(d.slides[0].layout["bg-fit"]).toBeUndefined();
  });

  it("sets and clears a background modifier", () => {
    let d = edit.setSlideBgOption(deck(), 0, "bg-dim", "0.5");
    expect(d.slides[0].layout["bg-dim"]).toBe("0.5");
    d = edit.setSlideBgOption(d, 0, "bg-dim", null);
    expect(d.slides[0].layout["bg-dim"]).toBeUndefined();
  });
});

describe("background survives serialization", () => {
  it("round-trips an image background with modifiers", () => {
    let d = edit.setSlideBg(deck(), 0, "image(assets/hero.jpg)");
    d = edit.setSlideBgOption(d, 0, "bg-dim", "0.5");
    d = edit.setSlideBgOption(d, 0, "bg-fit", "contain");
    const reparsed = parse(serialize(d)).deck;
    expect(reparsed.slides[0].layout.bg).toBe("image(assets/hero.jpg)");
    expect(reparsed.slides[0].layout["bg-dim"]).toBe("0.5");
    expect(reparsed.slides[0].layout["bg-fit"]).toBe("contain");
  });
});

describe("edits survive serialization", () => {
  it("an inspector edit serializes to text and re-parses identically", () => {
    const edited = edit.setColor(
      edit.setSize(deck(), 0, 0, "huge"),
      0,
      0,
      "accent",
    );
    const reparsed = parse(serialize(edited)).deck;
    expect(reparsed.slides[0].blocks[0].hints).toEqual(
      expect.arrayContaining(["huge", "accent"]),
    );
  });

  it("a layout change serializes a layout block", () => {
    const edited = edit.setLayout(deck(), 0, "two-up");
    expect(serialize(edited)).toContain("name: two-up");
  });
});
