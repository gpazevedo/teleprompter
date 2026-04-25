import React, { useState, useEffect, useCallback } from "react";

// Amber phosphor palette
export const C = {
  bg:         "#080705",
  bgControls: "#0c0b09",
  text:       "#ddd0b4",
  textBold:   "#f2e8d2",
  textFaint:  "rgba(237,224,196,0.35)",
  amber:      "#ffaa22",
  amberDim:   "rgba(255,170,34,0.5)",
  amberFaint: "rgba(255,170,34,0.15)",
  section:    "#b87830",
  divider:    "rgba(255,255,255,0.06)",
};

export const btnSmall = {
  background:   "rgba(255,255,255,0.05)",
  color:        "rgba(255,255,255,0.45)",
  border:       "1px solid rgba(255,255,255,0.08)",
  borderRadius: 5,
  padding:      "3px 10px",
  fontSize:     13,
  cursor:       "pointer",
  fontFamily:   "'Courier Prime', 'Courier New', monospace",
};

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

/** Decode a base64 audio string to a blob URL. */
export function b64ToBlob(audio_b64, mimeType = "audio/mpeg") {
  const binary = atob(audio_b64);
  const bytes = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i));
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/**
 * Play TTS audio for given text via /api/speak endpoint (NDJSON stream).
 * Returns { abort(), audio } — abort stops playback, audio is the live HTMLAudioElement.
 * Chunks are played sequentially as they arrive so playback starts sooner.
 */
export function playTts(text, voice, onEnd, outputDeviceId) {
  const ctrl = new AbortController();
  const handle = { abort: null, audio: null };
  const blobUrls = [];
  let aborted = false;

  const cleanup = () => {
    if (handle.audio) { handle.audio.pause(); handle.audio = null; }
    blobUrls.forEach(u => URL.revokeObjectURL(u));
    blobUrls.length = 0;
  };

  handle.abort = () => { aborted = true; ctrl.abort(); cleanup(); onEnd?.(); };

  (async () => {
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
        signal: ctrl.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const queue = [];
      let streamDone = false;

      const playNext = async () => {
        if (aborted || queue.length === 0) {
          if (streamDone) { cleanup(); onEnd?.(); }
          return;
        }
        const { audio, blobUrl } = queue.shift();
        handle.audio = audio;
        if (outputDeviceId && audio.setSinkId) await audio.setSinkId(outputDeviceId);
        if (aborted) { URL.revokeObjectURL(blobUrl); return; }
        audio.addEventListener("ended", () => {
          URL.revokeObjectURL(blobUrl);
          if (queue.length > 0) playNext();
          else if (streamDone) { cleanup(); onEnd?.(); }
        }, { once: true });
        audio.play();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const { audio_b64 } = JSON.parse(line);
          const blobUrl = b64ToBlob(audio_b64);
          blobUrls.push(blobUrl);
          const audio = new Audio(blobUrl);
          const wasEmpty = queue.length === 0 && !handle.audio;
          queue.push({ audio, blobUrl });
          if (wasEmpty) playNext();
        }
      }

      streamDone = true;
      if (!handle.audio && queue.length === 0) { cleanup(); onEnd?.(); }
    } catch (err) {
      if (err.name !== "AbortError") { cleanup(); onEnd?.(); }
    }
  })();

  return handle;
}

// ─── Audio device helpers ────────────────────────────────────────────────────

export function useAudioDevices() {
  const [audioInputs, setAudioInputs]     = useState([]);
  const [audioOutputs, setAudioOutputs]   = useState([]);
  const [selectedMic, setSelectedMic]     = useState("");
  const [selectedOutput, setSelectedOutput] = useState("");

  const refresh = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch { /* labels may be empty */ }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices
      .filter(d => d.kind === "audioinput")
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 6)}` }));
    const outputs = devices
      .filter(d => d.kind === "audiooutput")
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Output ${d.deviceId.slice(0, 6)}` }));
    setAudioInputs(inputs);
    setAudioOutputs(outputs);
    setSelectedMic(prev => prev || inputs[0]?.deviceId || "");
    setSelectedOutput(prev => prev || outputs[0]?.deviceId || "");
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refresh]);

  return { audioInputs, audioOutputs, selectedMic, setSelectedMic, selectedOutput, setSelectedOutput };
}

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
