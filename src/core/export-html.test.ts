import { describe, it, expect } from "vitest";
import { parse } from "./parse";
import { exportHtml } from "./export-html";
import { resolveTheme } from "./theme";

const DECK = `title: Test Deck\ntheme: ink\n---\n# One\n---\n## Two\n- a\n- b\n\n??? a note`;

describe("exportHtml", () => {
  it("produces a complete HTML document", () => {
    const html = exportHtml(parse(DECK).deck);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain("<title>Test Deck</title>");
  });

  it("emits one .deck-slide per slide", () => {
    const html = exportHtml(parse(DECK).deck);
    expect((html.match(/class="deck-slide"/g) ?? [])).toHaveLength(2);
  });

  it("is self-contained: inlines styles and the player script, no external src", () => {
    const html = exportHtml(parse(DECK).deck);
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+href=/);
  });

  it("includes keyboard navigation in the player", () => {
    const html = exportHtml(parse(DECK).deck);
    expect(html).toContain("ArrowRight");
    expect(html).toContain("ArrowLeft");
  });

  it("includes print CSS for one-slide-per-page PDF", () => {
    const html = exportHtml(parse(DECK).deck);
    expect(html).toContain("@media print");
    expect(html).toContain("page-break-after");
  });

  it("embeds speaker notes as hidden asides", () => {
    const html = exportHtml(parse(DECK).deck);
    expect(html).toContain('class="notes"');
    expect(html).toContain("a note");
  });

  it("escapes the title to avoid markup injection", () => {
    const html = exportHtml(parse(`title: <x>\n---\n# Hi`).deck);
    expect(html).toContain("<title>&lt;x&gt;</title>");
  });
});

describe("resolveTheme", () => {
  it("returns the requested theme", () => {
    expect(resolveTheme("ink").name).toBe("ink");
  });
  it("falls back to minimal for unknown themes", () => {
    expect(resolveTheme("does-not-exist").name).toBe("minimal");
  });
});
