/**
 * Serializer: Deck IR -> `.slide` source text.
 *
 * The inverse of `parse`. Together they make the deck round-trippable: the
 * inspector mutates the IR, we serialize back to text, and the editor shows
 * clean `.slide` source. The text file stays the single source of truth.
 *
 * Round-trip contract: `parse(serialize(parse(x))).deck` deep-equals
 * `parse(x).deck`. We do not promise byte-identical output (whitespace/quoting
 * is normalised), only that the *meaning* is stable.
 */
import type { Block, Deck, Slide } from "./ir";

/** Canonical front-matter key order; unknown keys follow, in insertion order. */
const META_ORDER = ["title", "theme", "aspect"];

export function serialize(deck: Deck): string {
  const parts: string[] = [];
  const front = serializeFrontMatter(deck);
  if (front) parts.push(front);
  for (const slide of deck.slides) {
    parts.push(serializeSlide(slide));
  }
  // Slides (and the front matter) are joined by the `---` separator.
  return parts.join("\n---\n") + "\n";
}

function serializeFrontMatter(deck: Deck): string {
  const { meta } = deck;
  const keys = [
    ...META_ORDER.filter((k) => meta[k] != null),
    ...Object.keys(meta).filter(
      (k) => !META_ORDER.includes(k) && meta[k] != null,
    ),
  ];
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}: ${meta[k]}`).join("\n");
}

function serializeSlide(slide: Slide): string {
  const lines: string[] = [];

  const layoutBlock = serializeLayout(slide);
  if (layoutBlock) lines.push(layoutBlock);

  const body = slide.blocks.map(serializeBlock).join("\n\n");
  if (body) lines.push(body);

  if (slide.notes) {
    lines.push(
      slide.notes
        .split("\n")
        .map((l, i) => (i === 0 ? `??? ${l}` : l))
        .join("\n"),
    );
  }

  return lines.join("\n\n");
}

/** Emit a ```layout block, but only when the slide isn't a plain default. */
function serializeLayout(slide: Slide): string {
  const { layout } = slide;
  const keys = Object.keys(layout).filter((k) => layout[k] != null);
  const isPlainDefault =
    layout.name === "default" &&
    keys.every((k) => k === "name");
  if (isPlainDefault) return "";

  const lines = ["```layout"];
  // name first, then the rest in insertion order.
  lines.push(`name: ${layout.name}`);
  for (const k of keys) {
    if (k === "name") continue;
    lines.push(`${k}: ${layout[k]}`);
  }
  lines.push("```");
  return lines.join("\n");
}

function serializeBlock(block: Block): string {
  const body = blockBody(block);
  return appendHints(body, block);
}

function blockBody(block: Block): string {
  switch (block.type) {
    case "heading":
      return `${"#".repeat(block.level ?? 2)} ${block.md}`;
    case "quote":
      // Re-add the blockquote markers the parser stripped.
      return block.md
        .split("\n")
        .map((l) => (l.trim() === "" ? ">" : `> ${l}`))
        .join("\n");
    case "code":
      return "```\n" + block.md + "\n```";
    case "rule":
      return "***";
    case "paragraph":
    case "image":
    case "list":
    case "table":
    case "html":
    default:
      return block.md;
  }
}

/**
 * Append a `{.hint .hint}` group to a block's source. For multi-line blocks
 * (list, quote, code, table) the group must sit at the end of the last line so
 * the parser's trailing-hint matcher picks it up.
 */
function appendHints(body: string, block: Block): string {
  if (block.hints.length === 0) return body;
  const group = `{${block.hints.map((h) => `.${h}`).join(" ")}}`;

  if (block.type === "code") {
    // Code can't carry inline hints; place the group after the closing fence.
    return `${body} ${group}`;
  }
  if (block.type === "quote") {
    // Attach to the last non-empty quoted line.
    const lines = body.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== ">" && lines[i].trim() !== "") {
        lines[i] = `${lines[i]} ${group}`;
        return lines.join("\n");
      }
    }
  }
  // list/table/paragraph/heading/image: append to the final line.
  const lines = body.split("\n");
  lines[lines.length - 1] = `${lines[lines.length - 1]} ${group}`;
  return lines.join("\n");
}
