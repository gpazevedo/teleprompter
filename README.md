# Teleprompter

Browser-based teleprompter for Toastmasters and public speakers. Smooth auto-scroll with adjustable speed, font size, and mirror mode for autocue setups.

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
```

## Controls

| Action | Keyboard | UI |
|---|---|---|
| Play / Pause | `Space` | PLAY button |
| Speed | `↑` / `↓` (±0.1x) | Slider (0.1x – 3.0x) |
| Font size | `[` / `]` | A− / A+ buttons |
| Reset | `R` | RESET button |
| Mirror | `M` | MIRROR button |

## Speech format (`public/speech.txt`)

```
## Section Title     → red section header
**Bold line**        → emphasized white text
---                  → visual break (spacer)
Regular line         → normal paragraph text
```
