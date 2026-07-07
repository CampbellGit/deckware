/**
 * Generate the comparison artifacts for the token benchmark, from the SAME
 * source decks, using deckware's own exporters:
 *   examples/<deck>.slide  ->  bench/artifacts/<deck>.pptx   (real PowerPoint)
 *                          ->  bench/artifacts/<deck>.html   (self-contained)
 * The .slide files are already the source of truth; we just emit the rival
 * formats so tokens.py can weigh them. (PDF is produced separately by printing
 * the HTML; if absent the PDF column is simply omitted.)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../src/core/parse.ts";
import { exportPptx } from "../src/core/export-pptx.ts";
import { exportHtml } from "../src/core/export-html.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const art = resolve(root, "bench/artifacts");
mkdirSync(art, { recursive: true });

const decks = ["cloud-migration", "java21-migration", "deckware-proposal"];
for (const name of decks) {
  const src = readFileSync(resolve(root, "examples", `${name}.slide`), "utf8");
  const { deck } = parse(src);

  const html = exportHtml(deck);
  writeFileSync(resolve(art, `${name}.html`), html);

  const blob = await exportPptx(deck);
  const buf = Buffer.from(await blob.arrayBuffer());
  writeFileSync(resolve(art, `${name}.pptx`), buf);
  console.log(`${name}: pptx ${(buf.length / 1024).toFixed(0)}KB, html ${(html.length / 1024).toFixed(0)}KB`);
}
console.log("artifacts written to bench/artifacts/");
