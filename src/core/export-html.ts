/**
 * Self-contained HTML export.
 *
 * Produces ONE `.html` file that:
 *   - plays like slides (arrow-key / click navigation, one slide at a time),
 *   - prints to clean per-page PDF (print CSS lays out one slide per page),
 *   - has zero external dependencies (CSS + a few lines of JS are inlined).
 *
 * This file IS the native distribution format. The PDF is just this file
 * printed, so the two never diverge.
 */
import type { Deck } from "./ir";
import { deckStylesheet, renderSlides } from "./render";
import { resolveTheme, googleFontsHref } from "./theme";

export interface ExportHtmlOptions {
  /** Resolve an image reference (e.g. a locally-picked filename) to an
   *  embeddable URL/data-URL so the exported file is self-contained. */
  resolveImage?: (ref: string) => string | undefined;
}

export function exportHtml(deck: Deck, opts: ExportHtmlOptions = {}): string {
  const slides = renderSlides(deck, { resolveImage: opts.resolveImage });
  const sheet = deckStylesheet(deck);
  const title = deck.meta.title ?? "Deck";
  // Size the print page to the deck's aspect so a slide maps 1:1 to a PDF page
  // (a fixed 16:9 @page would crop 4:3 decks and vice-versa).
  const [aw, ah] = (deck.meta.aspect ?? "16:9")
    .split(":")
    .map((n) => Number(n) || 0);
  const pageW = 1280;
  const pageH = aw && ah ? Math.round((pageW * ah) / aw) : 720;
  const printPage = `@media print { @page { size: ${pageW}px ${pageH}px; margin: 0; } }`;
  const fontsHref = googleFontsHref(resolveTheme(deck.meta.theme));
  const fontsLink = fontsHref
    ? `<link rel="preconnect" href="https://fonts.googleapis.com" />` +
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />` +
      `<link rel="stylesheet" href="${fontsHref}" />`
    : "";
  const slidesHtml = slides
    .map(
      (s, i) =>
        `<div class="deck-slide" data-index="${i}">${s.html}` +
        (s.notes
          ? `<aside class="notes">${escapeAttr(s.notes)}</aside>`
          : "") +
        `</div>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeAttr(title)}</title>
${fontsLink}
<style>
${BASE_PLAYER_CSS}
${printPage}
${sheet}
</style>
</head>
<body>
<div class="deck" id="deck">
${slidesHtml}
</div>
<div class="hud"><span id="page">1</span> / ${slides.length}</div>
<script>
${PLAYER_JS}
</script>
</body>
</html>`;
}

/** Player chrome + the print rules that make one slide == one page. */
const BASE_PLAYER_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: #111; }
.deck { width: 100%; height: 100%; }
.deck-slide {
  display: none;
  width: 100vw; height: 100vh;
  align-items: center; justify-content: center;
  padding: 3vh 3vw;
}
.deck-slide.active { display: flex; }
/* The slide itself is constrained to fit the viewport while keeping aspect. */
.deck-slide .slide {
  max-width: 100%; max-height: 100%;
  width: min(100%, calc((100vh - 6vh) * var(--aspect-w) / var(--aspect-h)));
  box-shadow: 0 10px 40px rgba(0,0,0,0.4);
  /* Keep background colours/images when printing to PDF — browsers drop them
     by default, which is why slide backgrounds/pictures went missing. */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.deck-slide .notes { display: none; }
.hud {
  position: fixed; bottom: 12px; right: 16px;
  font: 13px/1 -apple-system, sans-serif; color: #aaa;
  background: rgba(0,0,0,0.4); padding: 4px 8px; border-radius: 6px;
  user-select: none;
}
@media print {
  html, body { background: #fff; }
  .hud { display: none; }
  /* One slide per page, filling the page exactly (no viewport-based sizing,
     which cropped the slide when printing). The @page is sized to the deck's
     aspect so a slide maps 1:1 to a page. */
  .deck-slide {
    display: block !important;
    width: 100%; height: auto;
    padding: 0; margin: 0;
    page-break-after: always; break-after: page;
  }
  .deck-slide:last-child { page-break-after: auto; break-after: auto; }
  .deck-slide .slide {
    width: 100%; height: auto;
    max-width: none; max-height: none;
    box-shadow: none; border-radius: 0;
  }
  /* @page size is injected per-deck (aspect-aware) alongside this CSS. */
}
`;

const PLAYER_JS = `
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.deck-slide'));
  var i = 0;
  var page = document.getElementById('page');
  function show(n) {
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function (s, k) { s.classList.toggle('active', k === i); });
    if (page) page.textContent = String(i + 1);
    location.hash = String(i + 1);
  }
  function next() { show(i + 1); }
  function prev() { show(i - 1); }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { prev(); e.preventDefault(); }
    else if (e.key === 'Home') { show(0); }
    else if (e.key === 'End') { show(slides.length - 1); }
  });
  document.addEventListener('click', function (e) {
    // Click right half = next, left half = prev.
    if (e.clientX > window.innerWidth / 2) next(); else prev();
  });
  var start = parseInt((location.hash || '').slice(1), 10);
  show(isNaN(start) ? 0 : start - 1);
})();
`;

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
