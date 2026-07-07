# deckware benchmark — is the format thesis real?

The thesis: *people burn tokens making an LLM read a PDF to author a deck.* A
constrained text format (`.slide`) should be a **cheaper and more reliable**
LLM read/write target than either raw PowerPoint (OOXML) or a PDF.

This directory measures that, so the "keep building vs. switch to Marp"
decision rests on numbers, not vibes.

## What's measured

### 1. Token economics — `python3 bench/tokens.py`

For the **same three decks**, expressed three ways, how many tokens does an LLM
pay to read/write the content?

| format | what it is | why it matters |
|---|---|---|
| `.slide` | deckware source | what we'd ask the model to emit |
| `.pptx` OOXML | the slide XML *inside* the .pptx zip | the real surface to emit/parse for "native PowerPoint" |
| PDF text | extracted text layer | the status quo: "have the AI read the PDF" |

**Method honesty:**
- Counts use **tiktoken `cl100k_base`** (an OpenAI BPE). Absolute counts differ
  on Claude; **ratios between formats are stable across BPE tokenizers**, and
  ratios are the whole question. We report ratios.
- The `.pptx` column is the **OOXML slide XML**, not the zipped byte size —
  because an LLM that authors/edits PowerPoint natively must produce/consume
  that XML, not the binary.
- The PDF text column is the **optimistic** case (clean extractable text). Real
  decks are often scanned/flattened and read as **images (vision tokens)**,
  which is far more expensive again. So it's a lower bound on PDF cost.

### 2. Malformed rate + validator soundness — `npx vite-node bench/malformed.mjs`

The reliability half. `.slide` has a **closed grammar** (fixed layouts, hints,
themes, block kinds), so `src/core/validate.ts` can mechanically decide whether
a generated deck is well-formed and, if not, say exactly what's wrong — enabling
an agentic **generate → validate → repair** loop with no human in it.

- **OFFLINE (default):** runs the validator over `bench/corpus/` (hand-built
  valid + deliberately-broken decks) to prove the checker catches every defect
  class an LLM plausibly emits, and that valid decks pass.
- **LIVE (`ANTHROPIC_API_KEY` set):** prompts the model N times to author a deck
  from a brief in `.slide`, and reports how many parse+validate cleanly, how
  many are renderable (warnings only), and mean output tokens.
  `BENCH_RUNS=20 BENCH_MODEL=claude-opus-4-8 ANTHROPIC_API_KEY=… npx vite-node bench/malformed.mjs`

## Results (this machine, current decks)

### Tokens

```
deck                      .slide   .pptx OOXML    PDF text   OOXML/slide
cloud-migration              638         12802         283         20.1x
java21-migration             667         14663         325         22.0x
deckware-proposal            730         13565         345         18.6x
TOTAL                       2035         41030                     20.2x
```

**Per-slide, normalised (and vs a NATIVE human-made PowerPoint):**

```
deckware .slide       :     64 tokens/slide
deckware PPTX OOXML   :   1282 tokens/slide   (20x  the .slide)
NATIVE PPTX (template): 10211 tokens/slide   (161x the .slide)   [73 real slides]
```

So **is the PowerPoint export also cheaper than reading a PPTX? Yes —
massively, and in both directions:**
- deckware's *own* exported `.pptx` is already ~20× the tokens of the `.slide`
  it came from. The `.slide` is the cheap representation; the `.pptx` is the
  expensive derivative.
- A *real, human-authored* `.pptx` (measured against a corporate template) is
  ~**160×** the `.slide` per slide — native decks are bloated with theme refs,
  geometry, embedded media XML, and formatting runs. (Drop any `.pptx` at
  `bench/reference.pptx` to reproduce this row.)

Whichever PPTX you mean (ours or a hand-made one), `.slide` is the dramatically
cheaper token target for an LLM to read or write.

**Read this carefully — it cuts both ways:**

- **vs native PowerPoint: `.slide` wins ~20×.** Authoring/editing a deck as
  OOXML costs ~20× the tokens of `.slide`. If the workflow is "LLM produces an
  editable deck," `.slide` is decisively cheaper *and* the output is consistent.
- **vs reading a PDF: the PDF *text* is actually fewer tokens than `.slide`.**
  Because our decks are terse, the extracted text (~300 tok) is smaller than the
  `.slide` source (~650 tok) — the `.slide` carries layout/hint/theme structure
  the bare text doesn't. **So "save tokens vs. reading a PDF" is NOT true for the
  read step on clean text.** The PDF argument only holds when the PDF must be
  read as **images** (scanned/flattened → vision tokens, often 1–5k+/page), or
  when you count the *round trip* (read PDF → emit OOXML), where the OOXML
  emission dominates.

### Reliability

```
Defects flagged:        5/5   (validator caught every defect class)
Still rendered anyway:  2/5   (unknown hint / raw HTML → warn + degrade)
Valid decks passed:     2/2
```

The worst outcome for a malformed `.slide` is a **warning + graceful
degradation** — the deck still renders. A malformed OOXML file is one PowerPoint
**refuses to open**. That asymmetry, plus machine-checkable validation, is the
reliability case.

## Bottom line for the decision

The defensible wedge is **not** "fewer tokens than a PDF" (false for clean
text). It's the **combination**: ~20× cheaper than native PowerPoint to
author/edit, a closed grammar that's validate-and-repairable, and graceful
degradation instead of corrupt files. That is something Marp (open grammar,
raw HTML allowed) structurally cannot offer. See the repo root reply for the
full keep/switch recommendation.
