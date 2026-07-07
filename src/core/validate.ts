/**
 * Deterministic deck validation.
 *
 * This is the capability that makes `.slide` a good *machine* target: because
 * the grammar is closed (a fixed set of layouts, hints, themes, block kinds),
 * we can mechanically decide whether a generated deck is well-formed and, when
 * it isn't, say exactly what's wrong. An agent can therefore generate → check
 * → repair in a loop with no human in it.
 *
 * `validate()` works on the parsed IR plus the parser's own warnings, so it
 * catches both structural problems (e.g. a layout name the renderer can't lay
 * out) and lexical ones (unknown hints, surfaced as parse warnings).
 */
import type { Deck } from "./ir";
import { KNOWN_LAYOUTS, KNOWN_HINTS } from "./ir";
import { parse } from "./parse";
import { listThemes } from "../themes";

export type IssueSeverity = "error" | "warning";

export interface ValidationIssue {
  severity: IssueSeverity;
  /** 1-based slide index, or 0 for deck-level. */
  slide: number;
  /** Stable machine code, e.g. "unknown-layout". */
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean; // true iff there are no errors (warnings are allowed)
  issues: ValidationIssue[];
  counts: { errors: number; warnings: number };
}

const KNOWN_ALIGNS = new Set(["top", "center", "middle", "bottom"]);

/** Validate raw `.slide` source: parse, then check the IR + parse warnings. */
export function validateSource(source: string): ValidationResult {
  const { deck, warnings } = parse(source);
  const issues: ValidationIssue[] = [];

  // Lexical issues the parser already found (unknown hints, etc.) are warnings:
  // the deck still renders, the hint is just ignored.
  for (const w of warnings) {
    issues.push({
      severity: "warning",
      slide: w.slide,
      code: "unknown-hint",
      message: w.message,
    });
  }

  issues.push(...validateDeck(deck));
  return finalize(issues);
}

/** Validate an already-parsed deck (no access to lexical parse warnings). */
export function validate(deck: Deck): ValidationResult {
  return finalize(validateDeck(deck));
}

function validateDeck(deck: Deck): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const themeNames = new Set(listThemes().map((t) => t.name));

  // Deck-level: theme must be one we can resolve.
  if (deck.meta.theme && !themeNames.has(deck.meta.theme)) {
    issues.push({
      severity: "error",
      slide: 0,
      code: "unknown-theme",
      message: `Unknown theme "${deck.meta.theme}" (known: ${[...themeNames].join(", ")})`,
    });
  }

  if (deck.meta.aspect && !/^\d+\s*:\s*\d+$/.test(deck.meta.aspect)) {
    issues.push({
      severity: "error",
      slide: 0,
      code: "bad-aspect",
      message: `Aspect "${deck.meta.aspect}" must look like "16:9"`,
    });
  }

  const layouts = new Set<string>(KNOWN_LAYOUTS);
  deck.slides.forEach((slide, i) => {
    const n = i + 1;

    if (!layouts.has(slide.layout.name)) {
      issues.push({
        severity: "error",
        slide: n,
        code: "unknown-layout",
        message: `Unknown layout "${slide.layout.name}" (known: ${[...layouts].join(", ")})`,
      });
    }

    if (slide.layout.align && !KNOWN_ALIGNS.has(slide.layout.align)) {
      issues.push({
        severity: "error",
        slide: n,
        code: "bad-align",
        message: `Unknown align "${slide.layout.align}" (known: ${[...KNOWN_ALIGNS].join(", ")})`,
      });
    }

    // A slide with nothing on it is almost always a generation mistake.
    if (slide.blocks.length === 0) {
      issues.push({
        severity: "warning",
        slide: n,
        code: "empty-slide",
        message: "Slide has no content blocks",
      });
    }

    // Belt-and-braces: any hint that survived into the IR must be known. (The
    // parser drops unknown hints with a warning, so this should never fire —
    // it guards against a hand-built or future-parsed IR.)
    for (const block of slide.blocks) {
      for (const h of block.hints) {
        if (!KNOWN_HINTS.has(h)) {
          issues.push({
            severity: "error",
            slide: n,
            code: "unknown-hint",
            message: `Unknown hint "{.${h}}"`,
          });
        }
      }
      // Raw HTML passthrough is allowed but defeats the "constrained, portable"
      // promise — flag it so an agent can be told to avoid it.
      if (block.type === "html") {
        issues.push({
          severity: "warning",
          slide: n,
          code: "raw-html",
          message: "Raw HTML block — outside the portable vocabulary",
        });
      }
    }
  });

  return issues;
}

function finalize(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  return { ok: errors === 0, issues, counts: { errors, warnings } };
}
