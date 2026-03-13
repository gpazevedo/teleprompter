# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-based teleprompter for public speakers, built with React 18 + Vite.

## Commands

- `npm run dev` — Start Vite dev server (http://localhost:5173)
- `npm run build` — Production build to `dist/`
- No test or lint scripts configured

## Architecture

Single-component React app:

- **[main.jsx](main.jsx)** — Entry point, mounts app to `#root`
- **[teleprompter.jsx](teleprompter.jsx)** — All app logic: speech parsing, scroll animation, keyboard controls, UI
- **[public/speech.txt](public/speech.txt)** — Speech text fetched at runtime via `fetch()`

### Scroll animation

Uses `requestAnimationFrame` with a `speedRef` (ref, not state) so the loop never restarts when speed changes. Sub-pixel amounts accumulate in `accumRef` and flush when ≥1px — this prevents stalling at slow speeds.

### Speech format

`##` → section header · `**text**` → bold · `---` → spacer · plain text → paragraph

All styling is inline CSS (dark theme, serif fonts, red accents). No external CSS or CSS-in-JS.

### Speed control

Slider from 0.1x to 3.0x (step 0.05). Arrow keys adjust ±0.1x. Speed range constants: `SPEED_MIN`, `SPEED_MAX`, `SPEED_DEFAULT` at top of file.
