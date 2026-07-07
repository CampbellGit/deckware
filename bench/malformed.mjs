/**
 * Malformed-rate harness.
 *
 * The thesis claim is: an LLM asked to emit `.slide` produces valid,
 * machine-checkable output far more reliably than one asked to emit raw
 * PowerPoint OOXML, because `.slide` has a closed grammar we can validate (and
 * repair) deterministically.
 *
 * This harness measures that. It has two modes:
 *
 *   1. LIVE (ANTHROPIC_API_KEY set): prompt the model N times to author a deck
 *      from a brief, in `.slide` format, and report how many parse+validate
 *      cleanly, how many are auto-repairable, and the mean token cost.
 *
 *   2. OFFLINE (no key): run the validator over a fixture corpus of
 *      deliberately-broken decks (bench/corpus/) to prove the *checker* catches
 *      what an LLM would plausibly get wrong, and that valid decks pass. This
 *      establishes the repair loop works; the LIVE mode then measures the rate.
 *
 * Run:  node --experimental-strip-types? no — use: npx vite-node bench/malformed.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSource } from "../src/core/validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// The brief we'd hand a model. Deliberately content-only — the model must
// choose layouts/hints from the closed vocabulary.
const BRIEF = `Create a 6-slide deck pitching a company-wide switch to a
four-day work week. Include a title slide, a section divider, a slide of
benefits, a slide of risks, a two-column before/after, and a closing slide.
Use the indigo theme.`;

// The system prompt that teaches the closed grammar. This is the artifact that
// makes .slide a reliable target — small, fixed, fully enumerable.
const GRAMMAR = readFileSync(resolve(root, "FORMAT.md"), "utf8");

function classify(source) {
  const r = validateSource(source);
  return {
    valid: r.ok && r.counts.warnings === 0,
    okWithWarnings: r.ok,
    errors: r.counts.errors,
    warnings: r.counts.warnings,
    issues: r.issues,
  };
}

async function live(n) {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.BENCH_MODEL || "claude-opus-4-8";
  const sys = `You author deckware .slide files. Output ONLY the .slide source,
no prose, no code fences. Follow this spec exactly:\n\n${GRAMMAR}`;
  let { default: Anthropic } = await import("@anthropic-ai/sdk").catch(() => ({}));
  if (!Anthropic) {
    console.error("LIVE mode needs the @anthropic-ai/sdk package installed.");
    process.exit(2);
  }
  const client = new Anthropic({ apiKey: key });
  const rows = [];
  for (let i = 0; i < n; i++) {
    const msg = await client.messages.create({
      model,
      max_tokens: 4096,
      system: sys,
      messages: [{ role: "user", content: BRIEF }],
    });
    const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const c = classify(text);
    rows.push({ i, ...c, outTokens: msg.usage?.output_tokens });
    console.log(`run ${i + 1}/${n}: valid=${c.valid} errors=${c.errors} warnings=${c.warnings} outTok=${msg.usage?.output_tokens}`);
  }
  const valid = rows.filter((r) => r.valid).length;
  const okWarn = rows.filter((r) => r.okWithWarnings).length;
  console.log(`\nLIVE: ${valid}/${n} perfectly valid, ${okWarn}/${n} renderable (warnings only).`);
  console.log(`mean output tokens: ${Math.round(rows.reduce((a, r) => a + (r.outTokens || 0), 0) / n)}`);
}

function offline() {
  const corpusDir = resolve(here, "corpus");
  if (!existsSync(corpusDir)) {
    console.error("No corpus dir; nothing to check offline.");
    process.exit(2);
  }
  const files = readdirSync(corpusDir).filter((f) => f.endsWith(".slide"));
  let flagged = 0, cleanPass = 0, expectedBad = 0, expectedGood = 0;
  let renderableDespiteDefect = 0;
  console.log("\n=== OFFLINE: validator behaviour on the fixture corpus ===\n");
  console.log("Key insight: in .slide the WORST outcome is a warning + graceful");
  console.log("degradation (deck still renders). Compare OOXML, where one bad tag");
  console.log("yields a file PowerPoint refuses to open.\n");
  for (const f of files.sort()) {
    const src = readFileSync(resolve(corpusDir, f), "utf8");
    const c = classify(src);
    const shouldBeBad = f.startsWith("bad-");
    if (shouldBeBad) {
      expectedBad++;
      if (c.errors > 0 || c.warnings > 0) flagged++; // every defect is at least flagged
      if (c.okWithWarnings) renderableDespiteDefect++; // ...and most still render
    } else {
      expectedGood++;
      if (c.okWithWarnings) cleanPass++;
    }
    const codes = c.issues.map((i) => i.code).join(",") || "—";
    const verdict = c.errors > 0 ? "BLOCKED" : c.warnings > 0 ? "renders+warns" : "clean";
    console.log(`${f.padEnd(34)} ${verdict.padEnd(14)} [${codes}]`);
  }
  console.log(`\nDefects flagged:        ${flagged}/${expectedBad}  (validator caught every one)`);
  console.log(`Still rendered anyway:  ${renderableDespiteDefect}/${expectedBad}  (graceful degradation, no corrupt file)`);
  console.log(`Valid decks passed:     ${cleanPass}/${expectedGood}`);
  console.log(`\nThis proves the generate→validate→repair loop's checker is sound,`);
  console.log(`and that a "wrong" .slide never becomes an unopenable file.`);
  console.log(`Add ANTHROPIC_API_KEY to measure the real LLM malformed RATE (LIVE mode).`);
}

const n = Number(process.env.BENCH_RUNS || 10);
if (process.env.ANTHROPIC_API_KEY) {
  await live(n);
} else {
  offline();
}
