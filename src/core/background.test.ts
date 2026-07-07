import { describe, it, expect } from "vitest";
import { resolveTheme } from "./theme";
import { parseBg, resolveColor, autoContrastFg, bgCss } from "./background";

const theme = resolveTheme("minimal");

describe("resolveColor", () => {
  it("resolves palette tokens to theme vars", () => {
    expect(resolveColor("accent", theme)).toBe("#2563eb");
    expect(resolveColor("danger", theme)).toBe("#dc2626");
  });
  it("passes hex through verbatim", () => {
    expect(resolveColor("#0f1115", theme)).toBe("#0f1115");
  });
  it("passes CSS named colours through verbatim", () => {
    expect(resolveColor("white", theme)).toBe("white");
  });
});

describe("parseBg", () => {
  it("returns null for no value", () => {
    expect(parseBg(undefined, theme, undefined, undefined)).toBeNull();
  });

  it("parses an image(...) reference", () => {
    const spec = parseBg("image(assets/hero.jpg)", theme, undefined, undefined);
    expect(spec).toMatchObject({ kind: "image", url: "assets/hero.jpg" });
  });

  it("strips quotes inside image(...)", () => {
    const spec = parseBg(`image("a b.png")`, theme, undefined, undefined);
    expect(spec?.url).toBe("a b.png");
  });

  it("defaults images to cover fit and a small dim", () => {
    const spec = parseBg("image(x.jpg)", theme, undefined, undefined);
    expect(spec?.fit).toBe("cover");
    expect(spec?.dim).toBeCloseTo(0.35);
  });

  it("honours explicit bg-fit and bg-dim", () => {
    const spec = parseBg("image(x.jpg)", theme, "contain", "0");
    expect(spec?.fit).toBe("contain");
    expect(spec?.dim).toBe(0);
  });

  it("parses a colour token background", () => {
    const spec = parseBg("accent", theme, undefined, undefined);
    expect(spec).toMatchObject({ kind: "color", color: "#2563eb" });
  });
});

describe("autoContrastFg", () => {
  it("returns white on a dark background", () => {
    expect(autoContrastFg("#0f1115")).toBe("#ffffff");
  });
  it("returns dark on a light background", () => {
    expect(autoContrastFg("#ffffff")).toBe("#1a1a1a");
  });
  it("returns undefined for non-hex colours", () => {
    expect(autoContrastFg("rebeccapurple")).toBeUndefined();
  });
});

describe("bgCss", () => {
  it("emits background-color for a solid colour", () => {
    const spec = parseBg("#101418", theme, undefined, undefined)!;
    const { decls, fgOverride } = bgCss(spec);
    expect(decls).toContain("background-color");
    expect(fgOverride).toBe("#ffffff"); // dark bg → light text
  });

  it("emits an image layer with dim overlay and forces light text", () => {
    const spec = parseBg("image(hero.jpg)", theme, undefined, undefined)!;
    const { decls, fgOverride } = bgCss(spec);
    expect(decls).toContain("url('hero.jpg')");
    expect(decls).toContain("linear-gradient(rgba(0,0,0,0.35)");
    expect(decls).toContain("background-size: cover");
    expect(fgOverride).toBe("#ffffff");
  });

  it("omits the overlay when dim is 0", () => {
    const spec = parseBg("image(hero.jpg)", theme, undefined, "0")!;
    const { decls } = bgCss(spec);
    expect(decls).not.toContain("linear-gradient");
  });

  it("escapes quotes in image URLs", () => {
    const spec = parseBg(`image(a".jpg)`, theme, undefined, "0")!;
    const { decls } = bgCss(spec);
    expect(decls).toContain('a\\".jpg');
  });

  it("escapes single quotes in image URLs (url() uses single quotes)", () => {
    const spec = parseBg(`image(a'.jpg)`, theme, undefined, "0")!;
    const { decls } = bgCss(spec);
    expect(decls).toContain("a\\'.jpg");
  });
});
