// ─── Speech file parsing ──────────────────────────────────────────────────────

export function parseSpeech(text) {
  const items = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "---") {
      items.push({ type: "break" });
    } else if (trimmed.startsWith("## ")) {
      items.push({ type: "section", text: trimmed.slice(3) });
    } else if (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length > 4) {
      items.push({ type: "bold", text: trimmed.slice(2, -2) });
    } else if (trimmed !== "") {
      items.push({ type: "line", text: trimmed });
    }
  }
  return items;
}

// ─── Markdown → teleprompter text ─────────────────────────────────────────────

/** True when a filename is Markdown (.md / .markdown). */
export function isMarkdownFile(name = "") {
  return /\.(md|markdown)$/i.test(name);
}

/**
 * Convert a Markdown document to the teleprompter's plain text dialect
 * (`## ` section, `---` break, plain paragraphs), stripping Markdown-only
 * syntax: headings, emphasis markers, links, images, code fences, lists,
 * blockquotes, and tables.
 */
export function markdownToText(md) {
  const out = [];
  let inFence = false;
  for (const raw of md.split("\n")) {
    let line = raw;

    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) { out.push(line); continue; }

    // Horizontal rule → teleprompter break
    if (/^\s*(\*\*\*+|---+|___+)\s*$/.test(line)) { out.push("---"); continue; }

    // Heading (any level) → section header
    if (/^\s*#{1,6}\s+/.test(line)) {
      out.push("## " + line.replace(/^\s*#{1,6}\s+/, "").trim());
      continue;
    }

    // Table row → plain cells joined by " · "; drop separator rows
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
      if (!cells.every(c => /^:?-+:?$/.test(c))) out.push(cells.join(" · "));
      continue;
    }

    // Blockquote and list markers
    line = line.replace(/^\s*>\s?/, "");
    line = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, "");

    // Inline syntax: images (dropped), links (text), code, emphasis
    line = line.replace(/!\[([^\]]*)\]\([^)]*\)/g, "");
    line = line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    line = line.replace(/`([^`]+)`/g, "$1");
    line = line.replace(/(\*\*|__)(.+?)\1/g, "$2");
    line = line.replace(/\*([^*\n]+)\*/g, "$1");

    out.push(line);
  }
  return out.join("\n");
}

// ─── TTS helpers ──────────────────────────────────────────────────────────────

/** Count sentences in a text block (used for sentence-boundary mapping). */
export function countSentences(text) {
  return (text.match(/[^.!?]*[.!?]+/g) || [text]).length;
}

/**
 * Map sentence boundary events to item indices using cumulative sentence counts.
 * Returns [{itemIdx, startMs}] — one entry per speakable item.
 */
export function buildItemTimings(speakableItems, boundaries) {
  if (!boundaries.length) return [];
  const timings = [{ itemIdx: 0, startMs: boundaries[0].offset_ms }];
  let offset = 0;
  for (let i = 0; i < speakableItems.length - 1; i++) {
    offset += Math.max(1, countSentences(speakableItems[i].text));
    if (offset < boundaries.length) {
      timings.push({ itemIdx: i + 1, startMs: boundaries[offset].offset_ms });
    }
  }
  return timings;
}
