import React, { useState, useCallback } from "react";
import { parseSpeech } from "../speechUtils.js";
import { C, btnSmall } from "./theme.js";

const newId = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/**
 * Shared in-memory speech library — one list of speeches used by both the
 * Speaker and Tutor panels. Data only; each panel does its own scroll/TTS
 * reset when the active speech changes.
 */
export function useSpeechLibrary() {
  const [speeches, setSpeeches] = useState([]);
  const [activeId, setActiveId]   = useState(null);
  const [adding, setAdding]       = useState(false);

  const activeSpeech = speeches.find(s => s.id === activeId) ?? speeches[0];
  const speech = activeSpeech?.items ?? [];

  const addSpeech = useCallback(({ title, text }) => {
    const items = parseSpeech(text);
    if (!items.length) return;
    const id = newId();
    setSpeeches(prev => [...prev, { id, title, items }]);
    setActiveId(id);
    setAdding(false);
  }, []);

  const selectSpeech = useCallback((id) => setActiveId(id), []);

  const openAdd = useCallback(() => setAdding(true), []);
  const cancelAdd = useCallback(() => setAdding(false), []);

  const removeActive = useCallback(() => {
    if (!activeId) return;
    if (!window.confirm(`Remove "${activeSpeech?.title ?? "this text"}"?`)) return;
    const remaining = speeches.filter(s => s.id !== activeId);
    setSpeeches(remaining);
    setActiveId(remaining[0]?.id ?? null);
  }, [activeId, activeSpeech, speeches]);

  return {
    speeches, activeId, adding, activeSpeech, speech,
    addSpeech, selectSpeech, openAdd, cancelAdd, removeActive,
  };
}

/** Right-side TEXTS panel — lists speech titles, add/remove/select. */
export function LibraryPanel({ speeches, activeId, onSelect, onRemove, onAdd }) {
  return (
    <div style={{
      width: 210, flexShrink: 0,
      background: C.bgControls,
      borderLeft: `1px solid ${C.divider}`,
      display: "flex", flexDirection: "column",
      zIndex: 2,
    }}>
      <div style={{
        padding: "12px 14px 10px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${C.divider}`,
      }}>
        <span style={{
          fontFamily: "'Courier Prime', 'Courier New', monospace",
          fontSize: 11, letterSpacing: 3, color: C.section, fontWeight: 700,
        }}>
          TEXTS
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={onRemove}
            title="Remove selected text"
            style={{ ...btnSmall, padding: "4px 9px", fontSize: 11, fontWeight: 700, color: C.textFaint }}
          >
            ✕
          </button>
          <button onClick={onAdd} style={{
            ...btnSmall,
            padding: "4px 12px", fontSize: 11, fontWeight: 700, letterSpacing: 1,
            color: C.text,
          }}>
            + ADD
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {speeches.map(s => {
          const active = s.id === activeId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              title={s.title}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", marginBottom: 6,
                borderRadius: 5,
                background: active ? C.amberFaint : "rgba(255,255,255,0.03)",
                color: active ? C.amber : C.textFaint,
                border: `1px solid ${active ? C.amberDim : "transparent"}`,
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: 16, lineHeight: 1.3, letterSpacing: 0.4,
                cursor: "pointer", transition: "all 0.15s",
                overflowWrap: "anywhere",
              }}
            >
              {s.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
