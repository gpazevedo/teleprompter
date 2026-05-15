import React, { useState } from "react";
import { C, btnSmall } from "./theme.js";
import { ScanLines } from "./ui.jsx";

export function FilePicker({ onFile, onText, title = "Load your speech" }) {
  const [pasted, setPasted] = useState("");

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier Prime', 'Courier New', monospace",
      color: C.text,
      gap: 28,
      overflowY: "auto",
      padding: "32px 16px",
    }}>
      <ScanLines />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(4,3,2,0.75) 100%)",
      }} />

      <div style={{ position: "relative", textAlign: "center", zIndex: 1 }}>
        <div style={{
          fontSize: 11, letterSpacing: 8, color: C.section,
          textTransform: "uppercase", marginBottom: 16,
        }}>
          ◆ Teleprompter
        </div>
        <div style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 28, color: C.textBold, letterSpacing: 1,
          textShadow: "0 0 40px rgba(255,200,100,0.08)",
        }}>
          {title}
        </div>
      </div>

      <label
        style={{
          position: "relative", zIndex: 1,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          border: `1px solid ${C.divider}`,
          borderRadius: 8, padding: "28px 60px",
          cursor: "pointer",
          background: "rgba(255,255,255,0.02)",
          transition: "border-color 0.2s, background 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.amberDim; e.currentTarget.style.background = C.amberFaint; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.divider; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
      >
        <div style={{ fontSize: 36, lineHeight: 1 }}>◉</div>
        <div style={{ fontSize: 13, color: C.textFaint, letterSpacing: 2 }}>CHOOSE .TXT FILE</div>
        <input type="file" accept=".txt" onChange={onFile} style={{ display: "none" }} />
      </label>

      <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 16, width: "min(560px, 90vw)" }}>
        <div style={{ flex: 1, height: 1, background: C.divider }} />
        <span style={{ fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.15)" }}>OR PASTE TEXT</span>
        <div style={{ flex: 1, height: 1, background: C.divider }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "min(560px, 90vw)", display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          value={pasted}
          onChange={e => setPasted(e.target.value)}
          placeholder="Paste your speech text here..."
          style={{
            width: "100%", height: 160, resize: "vertical",
            background: "rgba(255,255,255,0.03)",
            color: C.text,
            border: `1px solid ${C.divider}`,
            borderRadius: 6,
            padding: "12px 14px",
            fontSize: 14, lineHeight: 1.6,
            fontFamily: "'EB Garamond', Georgia, serif",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = C.amberDim; }}
          onBlur={e => { e.currentTarget.style.borderColor = C.divider; }}
        />
        <button
          onClick={() => pasted.trim() && onText?.(pasted.trim())}
          disabled={!pasted.trim()}
          style={{
            ...btnSmall,
            alignSelf: "flex-end",
            padding: "7px 24px", fontSize: 13, fontWeight: 700, letterSpacing: 1,
            background: pasted.trim() ? `${C.amber}22` : "rgba(255,255,255,0.03)",
            color: pasted.trim() ? C.amber : "rgba(255,255,255,0.2)",
            border: `1px solid ${pasted.trim() ? C.amberDim : C.divider}`,
            cursor: pasted.trim() ? "pointer" : "default",
            transition: "all 0.2s",
          }}
        >
          USE THIS TEXT →
        </button>
      </div>

      <div style={{ position: "relative", zIndex: 1, fontSize: 10, color: "rgba(255,255,255,0.15)", letterSpacing: 2 }}>
        Plain text · ## sections · **bold** · --- breaks
      </div>
    </div>
  );
}
