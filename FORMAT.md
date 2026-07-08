# The `.slide` format

A `.slide` file is plain text. It is designed to be **light, human-readable, and
reliably writable by an LLM**. The guiding rule:

> **Content is markdown. Layout is a small declarative vocabulary. There is no
> raw-HTML escape hatch.**

Everything visual must be expressible through named layouts and a closed set of
hints. That constraint is the whole point — it is what keeps decks predictable
to generate and consistent to look at.

## `.slide` is Markdown (`.md` works too)

A `.slide` file **is valid Markdown** — the format is a strict *superset* of
CommonMark, adding only:

- inline `{.hint}` attribute tokens (the same `{.class}` shape Pandoc uses), and
- a fenced ` ```layout ` block (an ordinary fenced code block to any other tool),
- optional YAML-style front matter (understood by GitHub, Jekyll, Obsidian, …).

So the two extensions are interchangeable:

- **`.md`** — opens with Markdown highlighting in any editor, renders as a
  readable document on GitHub, diffs cleanly in a repo. A generic Markdown
  viewer shows the layout block as a code snippet and the hints as literal
  text — harmless, just unstyled.
- **`.slide`** — the same bytes, but the extension signals *deck intent* and
  enables deckware's tooling (validation, file association, the app/CLI).

deckware opens and saves both; pick `.md` for maximum reach in a codebase, or
`.slide` to mark a file as a deck. The parser treats them identically.

## File shape

```
<front matter>
---
<slide 1>
---
<slide 2>
---
...
```

- Slides are separated by a line containing only `---`.
- The block before the first `---` is the **front matter** (deck-level config).

### Front matter

Simple `key: value` lines:

```
title: Q3 Review
theme: minimal
aspect: 16:9
```

| Key      | Default     | Meaning                              |
| -------- | ----------- | ------------------------------------ |
| `title`  | —           | Deck title (file name, `<title>`).   |
| `theme`  | `minimal`   | Theme name.                          |
| `aspect` | `16:9`      | Slide aspect ratio.                  |
| `bg`     | —           | Deck-wide default background (see below). |
| `bg-fit` | `cover`     | Default image fit (`cover`/`contain`).    |
| `bg-dim` | —           | Default image dim overlay (0–1).          |

## A slide

A slide is markdown, optionally preceded by a fenced **layout block**:

````
```layout
name: two-up
align: center
```
## Left heading
- point one
- point two

![chart](chart.png) {.right}
````

If there is no layout block, the slide uses the `default` layout (auto-flow,
top-aligned).

### Backgrounds

A slide (or the whole deck, via front matter) can set a background:

```layout
name: section
bg: image(assets/hero.jpg)
bg-fit: cover     # or contain
bg-dim: 0.45      # 0–1 dark overlay so text stays legible
```

`bg:` accepts:

| Form              | Example                  | Notes                                   |
| ----------------- | ------------------------ | --------------------------------------- |
| Palette token     | `bg: accent`             | Resolves to the theme palette.          |
| Hex colour        | `bg: #0f1115`            | Any hex.                                |
| Named CSS colour  | `bg: white`              | Standard CSS colour names.              |
| Image reference   | `bg: image(hero.jpg)`    | Path or URL — **never embedded**, so the file stays light. |

A slide's `bg` overrides the deck default. Text colour auto-adjusts for
contrast on solid colours, and is forced light over a dimmed image. Images are
**referenced**, not embedded — the export can inline them into the standalone
HTML later if needed.

### Layouts

Layouts are **named templates**, not CSS. v0 vocabulary:

| Name      | Use                                              |
| --------- | ------------------------------------------------ |
| `default` | Auto-flow content, top-aligned.                  |
| `title`   | Centered title slide (big `#`, optional `##`).   |
| `section` | Section divider — one big centered heading.      |
| `two-up`  | Two columns; content splits at a blank line gap. |
| `quote`   | Large centered quotation.                        |

`align: top | center | bottom` controls vertical placement of content.

### Content model: auto-flow + hints

Content flows top-to-bottom in source order. You **nudge** it with inline
hints — a closed vocabulary attached with `{.hint}` after a block:

```
## Heading
- a point {.large}

![diagram](d.png) {.right .half}

> A bold claim. {.huge .center}
```

#### Hint vocabulary

| Group     | Hints                                              |
| --------- | -------------------------------------------------- |
| Size      | `small` `large` `huge`                             |
| Placement | `left` `right` `center`                            |
| Width     | `half` `third` `two-thirds` `full`                 |
| Colour    | `muted` `accent` `primary` `success` `warning` `danger` |
| Flow      | `fill` (grow to fill remaining vertical space)     |

Colour tokens resolve to the active theme's palette, so a deck stays
visually consistent and re-themes cleanly — there are no raw hex values.

Unknown hints are ignored (and surfaced as a warning by the parser).

### Columns

A line of exactly `:::` splits a slide into side-by-side columns — ideal for
comparisons, before/after, or multi-point slides. Content **before** the first
`:::` spans the full width (e.g. a slide heading); each `:::`-separated chunk
after it becomes one equal-width column. Two or three columns work best.

```
## Build vs Buy
:::
### Build
- Full control
- Higher upfront cost {.warning}
:::
### Buy
- Fast to launch {.success}
- Predictable pricing
```

Columns are just normal content, so headings, lists, images, and hints all work
inside them. Omit the leading full-width block if you want columns only.

### Icons

Write `:icon-name:` anywhere in inline text. It expands to an inline SVG that
inherits the surrounding text colour and size — no image files, no external
requests, so decks stay light.

```
## :rocket: Launch plan
- :check: Phase 1 shipped {.success}
- :clock: Phase 2 in progress {.warning}

:cloud: :server: :database: {.huge .accent}
```

The set is curated (so an LLM can enumerate it): cloud, server, database,
network, lock, shield, rocket, target, zap, check, check-circle, x,
alert-triangle, clock, calendar, users, user, briefcase, trending-up,
bar-chart, dollar-sign, code, cpu, box, layers, git, settings, lightbulb,
star, flag, globe, arrow-right, mail, search. Unknown names are left as-is
(and times like `12:30` are never touched — a name must start with a letter).

### Speaker notes

Lines beginning with `???` start speaker notes for the current slide. Notes are
not rendered on the slide; they are available to the presenter view and export.

```
## Roadmap
- ship v0

??? Remember to mention the timeline slips.
```

## Why these choices

- **Auto-flow over explicit positioning** — the lowest-friction thing to write
  and to generate. Precision lives in *named layouts* and *hints*, not in
  pixel coordinates.
- **Closed hint set** — an LLM can enumerate every valid option; a human never
  has to learn CSS. Themes decide what the tokens mean visually.
- **No raw HTML** — the moment raw HTML is allowed, both humans and LLMs lose
  the structure. Resilience parsing keeps stray HTML from crashing, but it is
  not a supported authoring path.
