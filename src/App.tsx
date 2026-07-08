import { useMemo, useRef, useState } from "react";
import { Editor, type EditorHandle } from "./ui/Editor";
import { Preview, type Selection } from "./ui/Preview";
import { Inspector } from "./ui/Inspector";
import { parse } from "./core/parse";
import { serialize } from "./core/serialize";
import { exportHtml } from "./core/export-html";
import { exportPptx } from "./core/export-pptx";
import { reorderBlock } from "./core/edits";
import { slideAtLine, slideRanges } from "./core/source-map";
import { useFileWatch } from "./ui/useFileWatch";
import { resolveAssetData } from "./ui/assets";
import { svgToPng } from "./ui/raster";
import type { Deck } from "./core/ir";
import { SAMPLE } from "./sample";
import "./App.css";

/** Which deck extension a filename implies. `.md`/`.markdown` → "md",
 *  everything else (incl. `.slide`) → "slide". Both are the same format. */
function extOf(fileName: string): "slide" | "md" {
  return /\.(md|markdown)$/i.test(fileName) ? "md" : "slide";
}

export default function App() {
  const [source, setSource] = useState(SAMPLE);
  const [slideIndex, setSlideIndex] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  // The extension of the currently-open file, so Save round-trips to the same
  // format. `.slide` and `.md` are interchangeable — a `.slide` file is just
  // Markdown with deck intent — so we honour whichever the user opened.
  const [docExt, setDocExt] = useState<"slide" | "md">("slide");
  const fileInput = useRef<HTMLInputElement>(null);
  const editorApi = useRef<EditorHandle | null>(null);
  const { deck, warnings } = useMemo(() => parse(source), [source]);

  // Open-from-disk with live reload: edit the file in VS Code (or anywhere) and
  // the deck updates here. Uses the File System Access API; falls back to a
  // one-shot <input> where that isn't available.
  const watch = useFileWatch((text, name) => {
    setSource(text);
    setSelection(null);
    setDocExt(extOf(name));
  });

  // Editor caret → active slide (scrolls preview to it).
  function onCursorLine(line: number) {
    setSlideIndex(slideAtLine(source, line));
  }

  // Preview scroll/click → active slide (scrolls editor to that slide's source).
  function onActivateSlide(i: number) {
    setSlideIndex(i);
    const ranges = slideRanges(source);
    if (ranges[i]) editorApi.current?.revealLine(ranges[i].start);
  }

  function openFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSource(String(reader.result ?? ""));
      setSlideIndex(0);
      setSelection(null);
      setDocExt(extOf(file.name));
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-opening the same file
  }

  function saveSource() {
    const name = (deck.meta.title ?? "deck").replace(/\s+/g, "-").toLowerCase();
    download(`${name}.${docExt}`, source, "text/plain");
  }

  // Inspector edits mutate the IR; we serialize back so the text stays canonical.
  function applyDeck(next: Deck) {
    setSource(serialize(next));
  }

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportDeckHtml() {
    const name = (deck.meta.title ?? "deck").replace(/\s+/g, "-").toLowerCase();
    download(
      `${name}.html`,
      exportHtml(deck, { resolveImage: resolveAssetData }),
      "text/html",
    );
  }

  // Present the deck: open the real player (identical to the HTML export) in a
  // new tab, so what you present is exactly what you'd ship — not the scrolling
  // editing preview.
  function presentDeck() {
    const html = exportHtml(deck, { resolveImage: resolveAssetData });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    // Revoke after the new tab has had time to load the document.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function exportPdf() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(exportHtml(deck, { resolveImage: resolveAssetData }));
    w.document.close();
    w.addEventListener("load", () => w.print());
  }

  async function exportDeckPptx() {
    const name = (deck.meta.title ?? "deck").replace(/\s+/g, "-").toLowerCase();
    const blob = await exportPptx(deck, {
      resolveImage: resolveAssetData,
      rasterizeSvg: (src) => svgToPng(src),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.pptx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          deckware <span className="tag" title="Deployed version">v{__APP_VERSION__}</span>
        </div>
        <div className="actions">
          {warnings.length > 0 && (
            <span
              className="warn"
              title={warnings
                .map((w) => `slide ${w.slide}: ${w.message}`)
                .join("\n")}
            >
              ⚠ {warnings.length}
            </span>
          )}
          {watch.watching && (
            <span
              className="live"
              title={`Watching ${watch.fileName} — edits on disk reload here. Click to stop.`}
              onClick={watch.stopWatch}
            >
              ● live: {watch.fileName}
            </span>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".slide,.md,.markdown,.txt,text/plain,text/markdown"
            style={{ display: "none" }}
            onChange={openFile}
          />
          <button
            className="ghost"
            onClick={() =>
              watch.supported ? watch.openViaHandle() : fileInput.current?.click()
            }
            title={
              watch.supported
                ? "Open a file and live-reload it when it changes on disk"
                : "Open a file"
            }
          >
            Open{watch.supported ? " ⟳" : ""}
          </button>
          <button
            className="ghost"
            onClick={saveSource}
            title={`Save as .${docExt}. Toggle the format with the selector.`}
          >
            Save
          </button>
          <select
            className="ext-select"
            value={docExt}
            onChange={(e) => setDocExt(e.target.value as "slide" | "md")}
            title="Deck file format — .slide and .md are interchangeable"
          >
            <option value="slide">.slide</option>
            <option value="md">.md</option>
          </select>
          <span className="sep" />
          <button
            onClick={presentDeck}
            title="Open the deck in a new tab exactly as it will present (arrow keys / click to navigate)"
          >
            ▶ Present
          </button>
          <button className="ghost" onClick={exportDeckHtml}>Export HTML</button>
          <button className="ghost" onClick={exportPdf}>Export PDF</button>
          <button className="ghost" onClick={exportDeckPptx}>Export PPTX</button>
        </div>
      </header>
      <main className="split">
        <section className="pane editor-pane">
          <Editor
            value={source}
            onChange={setSource}
            onCursorLine={onCursorLine}
            apiRef={(api) => (editorApi.current = api)}
          />
        </section>
        <section className="pane preview-pane">
          <Preview
            deck={deck}
            activeSlide={slideIndex}
            onActivateSlide={onActivateSlide}
            selection={selection}
            onSelect={setSelection}
            onReorder={(slide, from, to) =>
              applyDeck(reorderBlock(deck, slide, from, to))
            }
          />
        </section>
        <section className="pane inspector-pane">
          <Inspector
            deck={deck}
            slideIndex={Math.min(slideIndex, Math.max(0, deck.slides.length - 1))}
            selection={selection}
            onChange={applyDeck}
          />
        </section>
      </main>
    </div>
  );
}
