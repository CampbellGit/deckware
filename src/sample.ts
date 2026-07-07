/** The starter deck shown on first load — also doubles as a format demo. */
export const SAMPLE = `title: Deckware
theme: minimal
aspect: 16:9
---
\`\`\`layout
name: title
\`\`\`
# Deckware
## Slides as light, LLM-friendly text {.muted}
---
## Why deckware?
- Decks are plain text — tiny, diffable, version-controlled
- An LLM can read and write them reliably
- One source renders to a live deck **and** PDF

> No raw HTML. Layout is a small, learnable vocabulary. {.accent}
---
\`\`\`layout
name: two-up
\`\`\`
## Content on the left
- Markdown you already know
- Bullet points, **bold**, \`code\`
- Add a hint to nudge layout

![placeholder](https://placehold.co/600x400/2563eb/fff?text=figure) {.right}
---
\`\`\`layout
name: section
\`\`\`
# The layout DSL
---
## Hints, not CSS
- Size: \`{.small}\` \`{.large}\` \`{.huge}\`
- Width: \`{.half}\` \`{.third}\` \`{.full}\`
- Role: \`{.muted}\` \`{.accent}\`

That is the whole vocabulary. {.muted}
---
\`\`\`layout
name: quote
\`\`\`
> Simplicity is the soul of efficiency. {.huge}

??? Close on this. Austin Freeman, 1924.
`;
