import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Teleprompter from "./teleprompter.jsx";
import Tutor from "./tutor.jsx";
import FreeSpeech from "./freespeech.jsx";
import { C } from "./shared.jsx";

const TABS = [
  { id: "speaker",     label: "SPEAKER" },
  { id: "tutor",       label: "TUTOR" },
  { id: "freespeech",  label: "FREE SPEECH" },
];

function App() {
  const [tab, setTab] = useState("speaker");

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: C.bg }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 0,
        background: "#060503",
        borderBottom: `1px solid ${C.divider}`,
        fontFamily: "'Courier Prime', 'Courier New', monospace",
        flexShrink: 0,
        zIndex: 30,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? C.bg : "transparent",
              color: tab === t.id ? C.amber : C.textFaint,
              border: "none",
              borderBottom: tab === t.id ? `2px solid ${C.amber}` : "2px solid transparent",
              padding: "8px 28px",
              fontSize: 12,
              letterSpacing: 3,
              cursor: "pointer",
              fontFamily: "'Courier Prime', 'Courier New', monospace",
              fontWeight: 700,
              transition: "all 0.2s",
              textShadow: tab === t.id ? `0 0 12px ${C.amberFaint}` : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panels — both stay mounted to preserve state */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: tab === "speaker" ? "flex" : "none" }}>
          <Teleprompter />
        </div>
        <div style={{ position: "absolute", inset: 0, display: tab === "tutor" ? "flex" : "none" }}>
          <Tutor />
        </div>
        <div style={{ position: "absolute", inset: 0, display: tab === "freespeech" ? "flex" : "none" }}>
          <FreeSpeech />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
