/**
 * The Inspector: visual controls that edit the deck. Every change produces a
 * new Deck via the pure helpers in core/edits and is handed up to App, which
 * serializes it back to `.slide` text. The text remains the source of truth.
 */
import type { Deck } from "../core/ir";
import { COLOR_HINTS, KNOWN_LAYOUTS } from "../core/ir";
import { listThemes } from "../core/theme";
import * as edit from "../core/edits";
import type { Selection } from "./Preview";
import { putAsset } from "./assets";
import { useRef } from "react";

/** Background colour tokens offered as swatches (palette + theme bg/fg). */
const BG_TOKENS = ["bg", "fg", "muted", "accent", "primary", "success", "warning", "danger"];

const THEMES = listThemes();
const SIZES = [
  { label: "S", hint: "small" as const },
  { label: "M", hint: null },
  { label: "L", hint: "large" as const },
  { label: "XL", hint: "huge" as const },
];
const ALIGNS = [
  { label: "L", hint: "left" as const },
  { label: "C", hint: "center" as const },
  { label: "R", hint: "right" as const },
];
const WIDTHS = [
  { label: "Auto", hint: null },
  { label: "½", hint: "half" as const },
  { label: "⅓", hint: "third" as const },
  { label: "⅔", hint: "two-thirds" as const },
  { label: "Full", hint: "full" as const },
];

export function Inspector({
  deck,
  slideIndex,
  selection,
  onChange,
}: {
  deck: Deck;
  slideIndex: number;
  selection: Selection | null;
  onChange: (next: Deck) => void;
}) {
  const slide = deck.slides[slideIndex];
  const block =
    selection && selection.slide === slideIndex
      ? slide?.blocks[selection.block]
      : undefined;

  const has = (h: string) => !!block?.hints.includes(h as never);
  const activeSize = SIZES.find((s) => s.hint && has(s.hint))?.hint ?? null;
  const activeWidth = WIDTHS.find((w) => w.hint && has(w.hint))?.hint ?? null;

  return (
    <div className="inspector">
      <Section title="Deck">
        <Row label="Theme">
          <select
            value={deck.meta.theme}
            onChange={(e) => onChange(edit.setTheme(deck, e.target.value))}
          >
            {THEMES.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      {slide && (
        <Section title={`Slide ${slideIndex + 1}`}>
          <Row label="Layout">
            <select
              value={slide.layout.name}
              onChange={(e) =>
                onChange(edit.setLayout(deck, slideIndex, e.target.value))
              }
            >
              {KNOWN_LAYOUTS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Align">
            <Segmented
              options={[
                { label: "Top", value: "top" },
                { label: "Center", value: "center" },
                { label: "Bottom", value: "bottom" },
              ]}
              value={slide.layout.align ?? null}
              onSelect={(v) =>
                onChange(
                  edit.setSlideAlign(
                    deck,
                    slideIndex,
                    v as "top" | "center" | "bottom" | null,
                  ),
                )
              }
            />
          </Row>
          <BackgroundControls
            deck={deck}
            slideIndex={slideIndex}
            onChange={onChange}
          />
        </Section>
      )}

      <Section title="Block">
        {!block ? (
          <p className="hint-text">Click a block in the slide to edit it.</p>
        ) : (
          <>
            <div className="block-kind">{block.type}</div>
            <Row label="Size">
              <Segmented
                options={SIZES.map((s) => ({ label: s.label, value: s.hint }))}
                value={activeSize}
                onSelect={(v) =>
                  onChange(
                    edit.setSize(deck, selection!.slide, selection!.block, v as never),
                  )
                }
              />
            </Row>
            <Row label="Align">
              <Segmented
                options={ALIGNS.map((a) => ({ label: a.label, value: a.hint }))}
                value={ALIGNS.find((a) => has(a.hint))?.hint ?? null}
                allowClear
                onSelect={(v) =>
                  onChange(
                    edit.setAlign(deck, selection!.slide, selection!.block, v as never),
                  )
                }
              />
            </Row>
            <Row label="Width">
              <Segmented
                options={WIDTHS.map((w) => ({ label: w.label, value: w.hint }))}
                value={activeWidth}
                onSelect={(v) =>
                  onChange(
                    edit.setWidth(deck, selection!.slide, selection!.block, v as never),
                  )
                }
              />
            </Row>
            <Row label="Colour">
              <div className="swatches">
                <button
                  className={`swatch none ${!COLOR_HINTS.some(has) ? "sel" : ""}`}
                  title="Default"
                  onClick={() =>
                    onChange(
                      edit.setColor(deck, selection!.slide, selection!.block, null),
                    )
                  }
                />
                {COLOR_HINTS.map((c) => (
                  <button
                    key={c}
                    className={`swatch c-${c} ${has(c) ? "sel" : ""}`}
                    title={c}
                    onClick={() =>
                      onChange(
                        edit.setColor(deck, selection!.slide, selection!.block, c),
                      )
                    }
                  />
                ))}
              </div>
            </Row>
            <Row label="Order">
              <div className="seg">
                <button
                  onClick={() =>
                    onChange(
                      edit.moveBlock(deck, selection!.slide, selection!.block, -1),
                    )
                  }
                  disabled={selection!.block === 0}
                >
                  ↑ Up
                </button>
                <button
                  onClick={() =>
                    onChange(
                      edit.moveBlock(deck, selection!.slide, selection!.block, +1),
                    )
                  }
                  disabled={selection!.block >= slide.blocks.length - 1}
                >
                  ↓ Down
                </button>
              </div>
            </Row>
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="insp-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="insp-row">
      <span className="insp-label">{label}</span>
      <div className="insp-control">{children}</div>
    </div>
  );
}

function Segmented<T extends string | null>({
  options,
  value,
  onSelect,
  allowClear,
}: {
  options: { label: string; value: T }[];
  value: T;
  onSelect: (value: T) => void;
  allowClear?: boolean;
}) {
  return (
    <div className="seg">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.label}
            className={active ? "active" : ""}
            onClick={() => onSelect(allowClear && active ? (null as T) : o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Background editor for the current slide: colour token / hex / image. */
function BackgroundControls({
  deck,
  slideIndex,
  onChange,
}: {
  deck: Deck;
  slideIndex: number;
  onChange: (next: Deck) => void;
}) {
  const imgInput = useRef<HTMLInputElement>(null);
  const layout = deck.slides[slideIndex]?.layout;
  const bg = layout?.bg ?? "";
  const isImage = /^image\(/i.test(bg);
  const imageUrl = isImage ? bg.replace(/^image\(\s*(.+?)\s*\)$/i, "$1") : "";
  const isToken = BG_TOKENS.includes(bg);
  const isHex = /^#?[0-9a-f]{3,6}$/i.test(bg);

  const set = (value: string | null) =>
    onChange(edit.setSlideBg(deck, slideIndex, value));
  const setOpt = (key: "bg-fit" | "bg-dim", value: string | null) =>
    onChange(edit.setSlideBgOption(deck, slideIndex, key, value));

  return (
    <div className="bg-controls">
      <Row label="Background">
        <div className="seg">
          <button
            className={!bg ? "active" : ""}
            onClick={() => set(null)}
          >
            None
          </button>
          <button
            className={!isImage && bg ? "active" : ""}
            onClick={() => set(bg && !isImage ? bg : "accent")}
          >
            Colour
          </button>
          <button
            className={isImage ? "active" : ""}
            onClick={() => set(isImage ? bg : "image(https://picsum.photos/1280/720)")}
          >
            Image
          </button>
        </div>
      </Row>

      {bg && !isImage && (
        <>
          <Row label="Colour">
            <div className="swatches">
              {BG_TOKENS.map((t) => (
                <button
                  key={t}
                  className={`swatch c-${t} ${isToken && bg === t ? "sel" : ""}`}
                  title={t}
                  onClick={() => set(t)}
                />
              ))}
            </div>
          </Row>
          <Row label="Hex">
            <input
              className="text-input"
              type="text"
              placeholder="#0f1115"
              value={isHex ? bg : ""}
              onChange={(e) => set(e.target.value || null)}
            />
          </Row>
        </>
      )}

      {isImage && (
        <>
          <Row label="Image URL">
            <input
              className="text-input"
              type="text"
              placeholder="path or https://…"
              value={imageUrl}
              onChange={(e) => set(`image(${e.target.value})`)}
            />
          </Row>
          <Row label="Local file">
            <input
              ref={imgInput}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                e.target.value = ""; // allow re-picking the same file
                // Store the bytes in the browser and keep a clean, light
                // `image(filename)` reference in the source (never binary).
                const ref = await putAsset(file);
                set(`image(${ref})`);
              }}
            />
            <button
              className="btn-small"
              onClick={() => imgInput.current?.click()}
              title="Pick an image from your computer. The source keeps a short image(filename) reference; the picture is stored in your browser and embedded on export."
            >
              Choose file…
            </button>
          </Row>
          <Row label="Fit">
            <Segmented
              options={[
                { label: "Cover", value: "cover" },
                { label: "Contain", value: "contain" },
              ]}
              value={(layout?.["bg-fit"] as "cover" | "contain") ?? "cover"}
              onSelect={(v) => setOpt("bg-fit", v)}
            />
          </Row>
          <Row label="Dim">
            <Segmented
              options={[
                { label: "0", value: "0" },
                { label: "¼", value: "0.25" },
                { label: "½", value: "0.5" },
                { label: "¾", value: "0.75" },
              ]}
              value={layout?.["bg-dim"] ?? "0.35"}
              onSelect={(v) => setOpt("bg-dim", v)}
            />
          </Row>
        </>
      )}
    </div>
  );
}
