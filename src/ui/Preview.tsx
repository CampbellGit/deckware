/**
 * Scrolling slide preview — a vertical column of every slide, like the main
 * canvas in Google Slides / PowerPoint. It stays in sync with the editor both
 * ways: moving the caret scrolls the active slide into view, and scrolling the
 * preview (or clicking a slide) moves the editor caret to that slide.
 */
import { useEffect, useMemo, useRef } from "react";
import type { Deck } from "../core/ir";
import { deckStylesheet, renderSlides } from "../core/render";
import { resolveTheme, googleFontsHref } from "../core/theme";
import { resolveAsset } from "./assets";

/** Inject (once) the Google Fonts <link> for a theme into <head>. */
function useThemeFonts(themeName: string) {
  useEffect(() => {
    const href = googleFontsHref(resolveTheme(themeName));
    if (!href) return;
    const id = `deckware-font-${themeName}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }, [themeName]);
}

export interface Selection {
  slide: number;
  block: number;
}

/** Index of the slide whose vertical centre is closest to the viewport centre.
 *  Uses viewport-relative rects so it's independent of offsetParent quirks. */
function nearestToCentre(
  root: HTMLElement,
  els: (HTMLElement | null)[],
): number {
  const rootRect = root.getBoundingClientRect();
  const mid = rootRect.top + rootRect.height / 2;
  let best = -1;
  let bestDist = Infinity;
  els.forEach((el, i) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const centre = r.top + r.height / 2;
    const d = Math.abs(centre - mid);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

export function Preview({
  deck,
  activeSlide,
  onActivateSlide,
  selection,
  onSelect,
  onReorder,
}: {
  deck: Deck;
  /** The slide the editor caret is in; this one scrolls into view + highlights. */
  activeSlide: number;
  /** Fired when the user scrolls/clicks to a different slide (→ moves caret). */
  onActivateSlide: (i: number) => void;
  selection: Selection | null;
  onSelect: (sel: Selection | null) => void;
  onReorder: (slide: number, from: number, to: number) => void;
}) {
  const dragFrom = useRef<number | null>(null);
  const slides = useMemo(
    () => renderSlides(deck, { editable: true, resolveImage: resolveAsset }),
    [deck],
  );
  const sheet = useMemo(() => deckStylesheet(deck), [deck]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  // The user's own scrolling is the source of truth for the preview's scroll
  // position. We only programmatically scroll the preview when the active slide
  // was changed *by the editor* (not by scrolling the preview itself) — this
  // ref records the origin so the two directions never fight in a loop.
  const programmaticScroll = useRef(false);
  const onActivateRef = useRef(onActivateSlide);
  onActivateRef.current = onActivateSlide;
  useThemeFonts(deck.meta.theme);

  const current = Math.min(activeSlide, Math.max(0, slides.length - 1));

  // Editor → preview: scroll the active slide into view, but ONLY when the
  // preview isn't already showing it (i.e. the change came from the editor, not
  // from the user scrolling the preview). We compare against the slide nearest
  // the viewport centre and bail if it already matches.
  useEffect(() => {
    const root = scrollRef.current;
    const el = slideRefs.current[current];
    if (!root || !el) return;
    if (nearestToCentre(root, slideRefs.current) === current) return; // already in view
    programmaticScroll.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => (programmaticScroll.current = false), 450);
    return () => clearTimeout(t);
  }, [current]);

  // Preview → editor: on user scroll, activate whichever slide is nearest the
  // viewport centre. Ignored while we're the ones scrolling (programmatic).
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    let raf = 0;
    const onScroll = () => {
      if (programmaticScroll.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = nearestToCentre(root, slideRefs.current);
        if (i >= 0) onActivateRef.current(i);
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [slides.length]);

  // Apply the selection highlight after each render.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    root.querySelectorAll(".db-selected").forEach((el) =>
      el.classList.remove("db-selected"),
    );
    if (selection) {
      const host = slideRefs.current[selection.slide];
      host
        ?.querySelector(`[data-block="${selection.block}"]`)
        ?.classList.add("db-selected");
    }
  }, [selection, slides]);

  function onClickSlide(slideIdx: number, e: React.MouseEvent) {
    const target = (e.target as HTMLElement).closest("[data-block]");
    onActivateSlide(slideIdx);
    if (!target) {
      onSelect(null);
      return;
    }
    onSelect({ slide: slideIdx, block: Number(target.getAttribute("data-block")) });
  }

  function blockIndexFrom(e: React.DragEvent): number | null {
    const el = (e.target as HTMLElement).closest("[data-block]");
    return el ? Number(el.getAttribute("data-block")) : null;
  }

  return (
    <div className="preview">
      <style>{sheet}</style>
      <div className="preview-scroll deck" ref={scrollRef}>
        {slides.length === 0 ? (
          <div className="preview-empty">No slides yet</div>
        ) : (
          slides.map((slide, i) => (
            <div
              key={i}
              className={`preview-slide${i === current ? " is-active" : ""}`}
              data-slide={i}
              ref={(el) => {
                slideRefs.current[i] = el;
              }}
              onClick={(e) => onClickSlide(i, e)}
              onDragStart={(e) => {
                dragFrom.current = blockIndexFrom(e);
              }}
              onDragOver={(e) => {
                if (dragFrom.current !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                const from = dragFrom.current;
                const to = blockIndexFrom(e);
                dragFrom.current = null;
                if (from === null || to === null || from === to) return;
                e.preventDefault();
                onReorder(i, from, to);
                onSelect({ slide: i, block: to });
              }}
            >
              <span className="slide-number">{i + 1}</span>
              <div
                className="slide-host"
                // Slides are self-contained HTML from our renderer.
                dangerouslySetInnerHTML={{ __html: slide.html }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
