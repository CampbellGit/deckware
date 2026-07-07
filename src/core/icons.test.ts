import { describe, it, expect } from "vitest";
import { expandIcons, iconSvg, ICON_NAMES } from "./icons";
import { parse } from "./parse";

describe("icons", () => {
  it("renders a known icon to an inline SVG inheriting currentColor", () => {
    const svg = iconSvg("cloud");
    expect(svg).toContain("<svg");
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain("dw-icon");
  });

  it("returns null for an unknown icon", () => {
    expect(iconSvg("not-a-real-icon")).toBeNull();
  });

  it("expands :icon: tokens in a fragment", () => {
    const out = expandIcons("Secure :lock: by default");
    expect(out).toContain("<svg");
    expect(out).not.toContain(":lock:");
  });

  it("leaves unknown tokens untouched", () => {
    expect(expandIcons("see :foobar: token")).toContain(":foobar:");
  });

  it("does not mangle times like 12:30 (needs a leading letter)", () => {
    expect(expandIcons("at 12:30 today")).toBe("at 12:30 today");
  });

  it("exposes a non-empty sorted name list for discoverability", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(20);
    expect(ICON_NAMES).toContain("rocket");
  });
});

describe("icons via the parser", () => {
  it("expands icons in rendered HTML but keeps md clean for round-trip", () => {
    const { deck } = parse(`theme: minimal\n---\n- :check: done`);
    const block = deck.slides[0].blocks[0];
    expect(block.html).toContain("<svg");
    expect(block.md).toContain(":check:"); // source stays light/readable
  });
});
