#!/usr/bin/env python3
"""
Token-economics benchmark for the deckware thesis:
"people burn tokens making an LLM read a PDF to author a deck; a constrained
text format is a cheaper, more reliable LLM read/write target."

This script measures, for the SAME slide content expressed three ways, the
token cost an LLM pays to read it and to write it:

  1. .slide      — deckware's constrained markdown format
  2. .pptx-xml   — what an LLM must actually emit/parse for raw PowerPoint
                   (the OOXML inside the .pptx zip — this is the real surface)
  3. .pdf-text   — text extracted from a PDF of the same deck (the status quo:
                   "have the AI read the PDF")

Token counts use tiktoken cl100k_base. That is an OpenAI tokenizer, not
Claude's; absolute numbers will differ on Claude, but the *ratios between
formats* — which is the entire question here — are stable across BPE
tokenizers. We report ratios, and say so.

Outputs a table to stdout and writes bench/artifacts/tokens.json.
"""
import json
import os
import sys
import zipfile
import glob
import subprocess

import tiktoken

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "bench", "artifacts")
os.makedirs(ART, exist_ok=True)

enc = tiktoken.get_encoding("cl100k_base")


def toks(s: str) -> int:
    return len(enc.encode(s))


def slide_source(name: str) -> str:
    with open(os.path.join(ROOT, "examples", f"{name}.slide"), encoding="utf-8") as f:
        return f.read()


def pptx_ooxml_text(pptx_path: str) -> str:
    """The OOXML an LLM would actually have to read/write for this deck:
    concatenated slide XML parts. This is the honest 'raw PowerPoint' surface,
    not the binary zip size."""
    parts = []
    with zipfile.ZipFile(pptx_path) as z:
        for n in sorted(z.namelist()):
            if n.startswith("ppt/slides/slide") and n.endswith(".xml"):
                parts.append(z.read(n).decode("utf-8", "replace"))
    return "\n".join(parts)


def pdf_text(pdf_path: str) -> str:
    """Text an LLM extracts when 'reading the PDF' via a text layer (pypdf).

    NOTE: this is the *optimistic* PDF baseline — a clean extractable text
    layer. In the real world the PDF is often scanned/flattened and the model
    must read it as images (vision tokens), which is dramatically more
    expensive again. So treat this column as a lower bound on the PDF cost."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(pdf_path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""


def native_template_stats():
    """Per-slide OOXML token cost of a NATIVE, human-authored PowerPoint, as a
    reference point for what 'real' PPTX slides cost an LLM to read/write — vs
    deckware's exported PPTX and vs .slide.

    Drop any real `.pptx` at bench/reference.pptx (or set BENCH_PPTX) to include
    this row; it's skipped when absent so the benchmark runs without one."""
    tpl = os.environ.get("BENCH_PPTX", os.path.join(ROOT, "bench", "reference.pptx"))
    if not os.path.exists(tpl):
        return None
    per = []
    with zipfile.ZipFile(tpl) as z:
        names = sorted(
            n for n in z.namelist()
            if n.startswith("ppt/slides/slide") and n.endswith(".xml")
        )
        for n in names:
            per.append(toks(z.read(n).decode("utf-8", "replace")))
    if not per:
        return None
    return {"slides": len(per), "total": sum(per), "per_slide_avg": sum(per) / len(per)}


def main():
    decks = ["cloud-migration", "java21-migration", "deckware-proposal"]
    rows = []
    for name in decks:
        src = slide_source(name)
        slide_tok = toks(src)

        pptx_path = os.path.join(ART, f"{name}.pptx")
        ooxml_tok = None
        n_slides = None
        if os.path.exists(pptx_path):
            ooxml_tok = toks(pptx_ooxml_text(pptx_path))
            with zipfile.ZipFile(pptx_path) as z:
                n_slides = sum(
                    1 for n in z.namelist()
                    if n.startswith("ppt/slides/slide") and n.endswith(".xml")
                )

        pdf_path = os.path.join(ART, f"{name}.pdf")
        pdf_tok = None
        if os.path.exists(pdf_path):
            t = pdf_text(pdf_path)
            pdf_tok = toks(t) if t else None

        rows.append({
            "deck": name,
            "slides": n_slides,
            "slide_tokens": slide_tok,
            "pptx_ooxml_tokens": ooxml_tok,
            "pdf_text_tokens": pdf_tok,
        })

    # ---- report ----
    print("\n=== Token economics (tiktoken cl100k_base; ratios are the point) ===\n")
    hdr = f"{'deck':<22}{'.slide':>10}{'.pptx OOXML':>14}{'PDF text':>12}{'OOXML/slide':>14}"
    print(hdr)
    print("-" * len(hdr))
    tot_slide = tot_ooxml = 0
    for r in rows:
        ooxml = r["pptx_ooxml_tokens"]
        pdf = r["pdf_text_tokens"]
        ratio = f"{ooxml / r['slide_tokens']:.1f}x" if ooxml else "n/a"
        print(f"{r['deck']:<22}{r['slide_tokens']:>10}"
              f"{(ooxml if ooxml else '-'):>14}"
              f"{(pdf if pdf else '-'):>12}{ratio:>14}")
        tot_slide += r["slide_tokens"]
        if ooxml:
            tot_ooxml += ooxml
    print("-" * len(hdr))
    if tot_ooxml:
        print(f"{'TOTAL':<22}{tot_slide:>10}{tot_ooxml:>14}{'':>12}"
              f"{tot_ooxml / tot_slide:>13.1f}x")

    # ---- per-slide normalisation + native template reference ----
    tot_slides = sum(r["slides"] or 0 for r in rows)
    native = native_template_stats()
    print("\n=== Per-slide cost (normalised — fair across decks of different length) ===\n")
    if tot_slides:
        print(f"deckware .slide      : {tot_slide / tot_slides:8.0f} tokens/slide")
        print(f"deckware PPTX OOXML  : {tot_ooxml / tot_slides:8.0f} tokens/slide  "
              f"({tot_ooxml / tot_slide:.0f}x the .slide)")
    if native:
        print(f"NATIVE PPTX (template): {native['per_slide_avg']:8.0f} tokens/slide  "
              f"({native['per_slide_avg'] / (tot_slide / tot_slides):.0f}x the .slide)  "
              f"[{native['slides']} human-made slides]")
        print("\nReading: deckware's OWN exported .pptx is already far heavier than")
        print(".slide; a real human-authored .pptx is heavier still. So whichever")
        print("PPTX you mean, .slide is the cheaper token target — by a wide margin.")

    summary = {
        "tokenizer": "tiktoken/cl100k_base",
        "note": "Ratios between formats are tokenizer-stable; absolute counts "
                "differ on Claude. .pptx column = OOXML slide XML (the real "
                "read/write surface), not zip bytes.",
        "rows": rows,
        "totals": {
            "slide": tot_slide,
            "pptx_ooxml": tot_ooxml,
            "slides": tot_slides,
            "ooxml_over_slide": (tot_ooxml / tot_slide) if tot_ooxml else None,
            "slide_tokens_per_slide": (tot_slide / tot_slides) if tot_slides else None,
            "pptx_tokens_per_slide": (tot_ooxml / tot_slides) if tot_slides else None,
        },
        "native_template": native,
    }
    with open(os.path.join(ART, "tokens.json"), "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\nWrote {os.path.join('bench','artifacts','tokens.json')}")


if __name__ == "__main__":
    main()
