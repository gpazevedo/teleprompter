import React from "react";
import { C } from "./theme.js";

export const ScanLines = () => (
  <div style={{
    position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20,
    background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.055) 3px, rgba(0,0,0,0.055) 4px)",
  }} />
);

export const Vignette = ({ style }) => (
  <div style={{
    position: "absolute", inset: 0, pointerEvents: "none",
    background: "radial-gradient(ellipse 110% 100% at 50% 45%, transparent 38%, rgba(4,3,2,0.65) 100%)",
    ...style,
  }} />
);

export function DeviceSelect({ label, value, onChange, options, maxWidth }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2, whiteSpace: "nowrap" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: "#111008", color: C.text,
          border: `1px solid ${C.divider}`,
          borderRadius: 5, padding: "4px 8px",
          fontSize: 11, cursor: "pointer",
          fontFamily: "'Courier Prime', monospace",
          maxWidth: maxWidth || 140,
          overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

/** Mic level bar driven by a ref — no React re-renders on level change. */
export function AudioLevelMeter({ barRef }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: "#22cc66", fontSize: 11 }}>MIC</span>
      <div style={{
        width: 100, height: 10, borderRadius: 5,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div ref={barRef} style={{
          width: "0%",
          height: "100%", borderRadius: 5,
          background: "#22cc66",
          transition: "width 0.05s linear",
        }} />
      </div>
    </div>
  );
}
