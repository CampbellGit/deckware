<h1 align="center">deckware</h1>

<p align="center">
  <b>Slides as light, LLM-friendly text.</b><br />
  A whole slide is <b>~60 tokens</b>, not the <b>~10,000</b> a PowerPoint slide costs an LLM to read or write.
</p>

<p align="center">
  <a href="https://campbellgit.github.io/deckware/"><b>Home</b></a> ·
  <a href="https://campbellgit.github.io/deckware/app/"><b>Launch the app →</b></a> ·
  <a href="./FORMAT.md">Format spec</a> ·
  <a href="./bench">Benchmark</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" />
  <img src="https://img.shields.io/github/actions/workflow/status/CampbellGit/deckware/ci.yml?branch=main" alt="CI" />
</p>

<!-- TODO: replace with a hero GIF — type markdown on the left, slides update
     live, then hit Present. Record it from the live app (see LAUNCH notes).
<p align="center"><img src="docs/hero.gif" alt="deckware demo" width="800" /></p>
-->

---

Write a deck in an extended-markdown `.slide` format, see it live in a browser
editor, edit it visually, and export a self-contained HTML deck, a PDF, or an
editable PowerPoint.

**The bet: the format is the product.** Decks are plain text — tiny, diffable,
and reliably read/written by an LLM — because content is markdown, layout is a
small closed vocabulary, and there is no raw-HTML escape hatch. That's why a
slide is ~60 tokens instead of ~10,000, and why an LLM can generate one without
producing a corrupt file (see the [benchmark](./bench)).

**Why it's different from Marp/Slidev:** the grammar is *closed and
validatable*. An agent can generate → validate → repair a deck with no human in
the loop, and a malformed deck degrades gracefully instead of failing to open.

## Quick start

```bash
npm install
npm run dev      # editor + live preview at http://localhost:5173
npm run build    # type-check + production build
npm test         # unit tests (parser, renderer, export) via Vitest
npm run test:e2e # end-to-end: render a deck to screenshots via Playwright
```

## Using an LLM to write decks

deckware is designed so an LLM can author a deck reliably. Paste the prompt
below into any assistant (Claude, ChatGPT, …), fill in the last two lines, and
open the resulting `.slide`/`.md` file with the **Open** button.

````text
You are generating a deck in the `.slide` format for deckware. Output ONLY the
raw .slide file content — no prose, no surrounding code fences.

# File shape
- Front matter (key: value lines) at the top, then a line with only `---`.
- Slides are separated by a line containing only `---`.

# Front matter keys
- title: <deck title>
- theme: one of  minimal | ink | indigo
- aspect: 16:9
- Optional: bg, bg-fit (cover|contain), bg-dim (0–1) for a deck-wide background.

# A slide
Markdown, optionally preceded by a fenced layout block:
```layout
name: <layout>
align: top | center | bottom      (optional)
bg: <background>                  (optional)
bg-dim: 0.5                       (optional, for image backgrounds)
```

# Layouts (the only valid names)
- default  — auto-flow content (headings, bullets). No layout block needed.
- title    — centered title slide: one big `#` heading + optional `##` subtitle.
- section  — section divider: one big centered heading. Pair with a bold bg.
- two-up   — two columns. Tag the block that goes right with {.right}.
- quote    — one large centered quotation (`>`).

# Backgrounds (bg:)
- Hex: `bg: #00003b`
- Palette token: `bg: accent`  (also primary, success, warning, danger)
- Named colour: `bg: white`
- Image: `bg: image(path-or-url)`  — add `bg-dim: 0.5` so text stays readable.

# Content + hints
Content flows top-to-bottom. Append `{.hint}` after a block to nudge it.
Hints (the COMPLETE list — never invent others):
- Size:      small | large | huge
- Placement: left | right | center
- Width:     half | third | two-thirds | full
- Colour:    muted | accent | primary | success | warning | danger
- Flow:      fill
Per-bullet hints work: `- shipped {.success}` colours just that item.
Colours resolve to the theme palette — do NOT use raw hex in hints.

# Icons
Write `:name:` in text; it becomes an inline icon matching text colour/size.
Valid names ONLY: cloud, server, database, network, lock, shield, rocket,
target, zap, check, check-circle, x, alert-triangle, clock, calendar, users,
user, briefcase, trending-up, bar-chart, dollar-sign, code, cpu, box, layers,
git, settings, lightbulb, star, flag, globe, arrow-right, mail, search, coffee,
feather.

# Speaker notes
A line starting with `???` adds speaker notes (not shown on the slide).

# Rules
- NO raw HTML. NO CSS. NO hints/layouts/icons outside the lists above.
- Keep bullets short (max ~4–6 per slide). Lead bullets with an icon where useful.
- Use `title` for slide 1, `section` dividers between parts, `quote` for punchy
  statements, and a `title` slide at the end for contact/close.

# Task
Create a deck about: <DESCRIBE TOPIC, AUDIENCE, KEY POINTS>
Use the <THEME> theme. Aim for <N> slides.
````

## How it works

```
.slide source  ◀──────────────────────────┐
   │  src/core/parse.ts                     │ serialize (src/core/serialize.ts)
   ▼                                        │
 Deck IR  (src/core/ir.ts)                  │
   │                                        │
   ├─ src/core/render.ts → live preview / export-html.ts → self-contained .html
   └─ src/core/edits.ts  → inspector edits ─┘  (mutate IR, write back to text)
```

The **text file is the single source of truth**. The visual inspector doesn't
edit a separate document — it mutates the IR and serializes back to `.slide`
text, so editing in the UI and editing the text are the same thing
(round-trippable: `parse → serialize → parse` is stable).

One renderer feeds the live preview, the exported HTML, and the PDF, so they
can never drift. `src/core/validate.ts` mechanically checks a deck against the
closed grammar, so a generate → validate → repair loop needs no human.

## Editing

- **Click a block** in the preview to select it; edit size, alignment, width,
  colour, order, layout, theme, and background in the inspector — every control
  writes back into the source text.
- **Drag blocks** in the preview to reorder them within a slide.
- The preview is a **scrolling column of all slides** kept in sync with the
  editor caret (scroll ↔ cursor, both ways).
- **Backgrounds**: per-slide (or deck-wide) solid colour (palette token or any
  hex) or a referenced image (URL, path, or a locally-chosen file) with fit +
  dim overlay. Text contrast auto-adjusts.
- **Open / Save**: load a `.slide`/`.md` file from disk (with live-reload when
  the file changes on disk, where the browser supports it), or save the source.
- **Icons**: `:icon-name:` expands to an inline SVG that inherits text colour.
- **Per-item hints**: `- text {.danger}` styles that single list item.

`.slide` and `.md` are interchangeable — a `.slide` file is valid Markdown; the
extension just signals deck intent and enables tooling.

## Layouts & hints

Layouts: `default` · `title` · `section` · `two-up` · `quote`.

Hints (the whole vocabulary): size `small/large/huge`, placement
`left/right/center`, width `half/third/two-thirds/full`, role
`muted/accent/primary/success/warning/danger`, flow `fill`.

## Themes

Themes are **config files**, not code: each is a `*.theme.json` file in
`src/themes/`. To add one, drop in a new `mybrand.theme.json` — no code change,
no registry edit (they're auto-discovered at build time).

```json
{
  "name": "mybrand",
  "label": "My Brand",
  "extends": "minimal",
  "googleFonts": ["Inter"],
  "vars": {
    "--color-accent": "#3949d1",
    "--color-heading": "#3949d1",
    "--font-body": "'Inter', system-ui, sans-serif"
  }
}
```

A theme is a bag of CSS custom properties (+ optional Google Fonts). Use
`extends` to inherit another theme's vars and override only what changes.
Built-in: `minimal`, `ink` (dark), `indigo` (branded example).

## Export

- **HTML** — one self-contained file that plays like slides.
- **PDF** — the HTML printed (one slide per page).
- **PPTX** — a real, editable PowerPoint via `pptxgenjs`, applying the theme's
  fonts/colours and backgrounds (a *mapping*, not pixel-identical to the HTML).

## Deploy

Pushing a semver tag (`v1.2.3`) builds the app and publishes it to GitHub Pages
via `.github/workflows/deploy.yml`. See that workflow for details.

## License

[MIT](./LICENSE).
