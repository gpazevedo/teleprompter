import { describe, it, expect } from "vitest";
import { parseSpeech, countSentences, buildItemTimings } from "./speechUtils.js";

// ─── parseSpeech ──────────────────────────────────────────────────────────────

describe("parseSpeech", () => {
  it("parses a section header", () => {
    expect(parseSpeech("## Introduction")).toEqual([
      { type: "section", text: "Introduction" },
    ]);
  });

  it("parses a bold line", () => {
    expect(parseSpeech("**Key point here**")).toEqual([
      { type: "bold", text: "Key point here" },
    ]);
  });

  it("parses a plain line", () => {
    expect(parseSpeech("Hello world")).toEqual([
      { type: "line", text: "Hello world" },
    ]);
  });

  it("parses a break", () => {
    expect(parseSpeech("---")).toEqual([{ type: "break" }]);
  });

  it("skips blank lines", () => {
    expect(parseSpeech("\n\n  \n")).toEqual([]);
  });

  it("does not treat ** as bold if too short", () => {
    // "****" length is 4, not > 4 — edge case
    expect(parseSpeech("****")).toEqual([{ type: "line", text: "****" }]);
  });

  it("trims leading and trailing whitespace from each line", () => {
    // line.trim() removes both ends, so "  ## Title  " → "## Title" → slice(3) → "Title"
    expect(parseSpeech("  ## Title  ")).toEqual([
      { type: "section", text: "Title" },
    ]);
  });

  it("parses a mixed speech correctly", () => {
    const input = [
      "## Opening",
      "**Welcome everyone.**",
      "Today we speak about courage.",
      "---",
      "Thank you.",
    ].join("\n");

    expect(parseSpeech(input)).toEqual([
      { type: "section", text: "Opening" },
      { type: "bold",    text: "Welcome everyone." },
      { type: "line",    text: "Today we speak about courage." },
      { type: "break" },
      { type: "line",    text: "Thank you." },
    ]);
  });
});

// ─── countSentences ───────────────────────────────────────────────────────────

describe("countSentences", () => {
  it("counts a single sentence ending with period", () => {
    expect(countSentences("Hello world.")).toBe(1);
  });

  it("counts multiple sentences", () => {
    expect(countSentences("First. Second. Third.")).toBe(3);
  });

  it("counts sentences ending with ! and ?", () => {
    expect(countSentences("Really? Yes! Great.")).toBe(3);
  });

  it("returns 1 for text with no sentence-ending punctuation", () => {
    expect(countSentences("No punctuation here")).toBe(1);
  });

  it("handles ellipsis as one sentence boundary", () => {
    expect(countSentences("Hmm...")).toBe(1);
  });
});

// ─── buildItemTimings ─────────────────────────────────────────────────────────

describe("buildItemTimings", () => {
  const b = (offset_ms) => ({ offset_ms });

  it("returns empty array when boundaries is empty", () => {
    const items = [{ text: "Hello world." }];
    expect(buildItemTimings(items, [])).toEqual([]);
  });

  it("returns one entry for a single item", () => {
    const items = [{ text: "Hello." }];
    const boundaries = [b(0)];
    expect(buildItemTimings(items, boundaries)).toEqual([
      { itemIdx: 0, startMs: 0 },
    ]);
  });

  it("maps each item to its boundary by cumulative sentence count", () => {
    // item 0 has 1 sentence → item 1 starts at boundary index 1
    // item 1 has 2 sentences → item 2 starts at boundary index 3
    const items = [
      { text: "One sentence." },
      { text: "Two sentences. Right here." },
      { text: "Final item." },
    ];
    const boundaries = [b(0), b(500), b(1000), b(1500)];
    expect(buildItemTimings(items, boundaries)).toEqual([
      { itemIdx: 0, startMs: 0 },
      { itemIdx: 1, startMs: 500 },
      { itemIdx: 2, startMs: 1500 },
    ]);
  });

  it("stops mapping when boundaries run out", () => {
    const items = [
      { text: "Item one." },
      { text: "Item two." },
      { text: "Item three." },
    ];
    // Only 2 boundaries — cannot reach item 2
    const boundaries = [b(0), b(400)];
    expect(buildItemTimings(items, boundaries)).toEqual([
      { itemIdx: 0, startMs: 0 },
      { itemIdx: 1, startMs: 400 },
    ]);
  });

  it("treats an item with no sentence punctuation as 1 sentence", () => {
    const items = [{ text: "No punctuation" }, { text: "Second item." }];
    const boundaries = [b(0), b(700)];
    expect(buildItemTimings(items, boundaries)).toEqual([
      { itemIdx: 0, startMs: 0 },
      { itemIdx: 1, startMs: 700 },
    ]);
  });
});
