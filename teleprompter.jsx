import React, { useState, useEffect, useRef, useCallback } from "react";

function parseSpeech(text) {
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

const SPEED_MIN = 0.1;
const SPEED_MAX = 3.0;
const SPEED_DEFAULT = 1.2;

export default function Teleprompter() {
  const [speech, setSpeech] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEED_DEFAULT);
  const [mirrored, setMirrored] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef(null);
  const animRef = useRef(null);
  const lastTimeRef = useRef(null);
  const intervalRef = useRef(null);
  const speedRef = useRef(speed);
  const accumRef = useRef(0);

  useEffect(() => { speedRef.current = speed; }, [speed]);

  const scroll = useCallback((timestamp) => {
    if (!scrollRef.current) return;
    if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
    const delta = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;
    accumRef.current += speedRef.current * delta * 0.06;
    const px = Math.floor(accumRef.current);
    if (px > 0) {
      scrollRef.current.scrollTop += px;
      accumRef.current -= px;
    }
    animRef.current = requestAnimationFrame(scroll);
  }, []);

  useEffect(() => {
    if (playing) {
      lastTimeRef.current = null;
      animRef.current = requestAnimationFrame(scroll);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, scroll]);

  useEffect(() => {
    fetch("speech.txt")
      .then(r => r.text())
      .then(text => setSpeech(parseSpeech(text)));
  }, []);

  useEffect(() => {
    if (playing && !intervalRef.current) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
  }, [playing]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setProgress(max > 0 ? el.scrollTop / max : 0);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const reset = () => {
    setPlaying(false);
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setElapsed(0);
    setProgress(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const handleKey = useCallback((e) => {
    if (e.code === "Space") { e.preventDefault(); setPlaying(p => !p); }
    if (e.code === "ArrowUp") { e.preventDefault(); setSpeed(s => Math.min(SPEED_MAX, +(s + 0.1).toFixed(2))); }
    if (e.code === "ArrowDown") { e.preventDefault(); setSpeed(s => Math.max(SPEED_MIN, +(s - 0.1).toFixed(2))); }
    if (e.code === "KeyR") { e.preventDefault(); reset(); }
    if (e.code === "KeyM") { e.preventDefault(); setMirrored(m => !m); }
    if (e.code === "BracketRight") { e.preventDefault(); setFontSize(s => Math.min(80, s + 4)); }
    if (e.code === "BracketLeft") { e.preventDefault(); setFontSize(s => Math.max(20, s - 4)); }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#0a0a0a",
      fontFamily: "'Georgia', 'Times New Roman', serif",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Guide line */}
      <div style={{
        position: "absolute", top: "35%", left: 0, right: 0, height: 2,
        background: "rgba(220, 60, 60, 0.4)", zIndex: 10, pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", top: "35%", left: 12, zIndex: 10, pointerEvents: "none",
        width: 0, height: 0, borderTop: "8px solid transparent",
        borderBottom: "8px solid transparent", borderLeft: "10px solid rgba(220,60,60,0.6)",
        transform: "translateY(-8px)",
      }} />

      {/* Scroll area */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "8px 48px 65vh 48px",
        scrollBehavior: "auto",
        transform: mirrored ? "scaleX(-1)" : "none",
        scrollbarWidth: "none",
      }}>
        <style>{`div::-webkit-scrollbar { display: none; }`}</style>
        {speech.map((item, i) => {
          if (item.type === "break") {
            return <div key={i} style={{ height: 60 }} />;
          }
          if (item.type === "section") {
            return (
              <div key={i} style={{
                fontSize: fontSize * 0.45,
                fontFamily: "'Courier New', monospace",
                color: "rgba(220, 60, 60, 0.5)",
                letterSpacing: 4,
                fontWeight: 700,
                marginBottom: 16,
                marginTop: 8,
                textTransform: "uppercase",
              }}>
                {item.text}
              </div>
            );
          }
          if (item.type === "bold") {
            return (
              <p key={i} style={{
                fontSize, lineHeight: 1.6, color: "#ffffff",
                fontWeight: 700, margin: "0 0 32px 0",
                textShadow: "0 0 40px rgba(220,60,60,0.2)",
              }}>
                {item.text}
              </p>
            );
          }
          return (
            <p key={i} style={{
              fontSize, lineHeight: 1.6,
              color: "rgba(255,255,255,0.92)",
              fontWeight: 400, margin: "0 0 32px 0",
            }}>
              {item.text}
            </p>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{
        background: "rgba(20,20,20,0.95)", borderTop: "1px solid rgba(255,255,255,0.08)",
        transform: mirrored ? "scaleX(-1)" : "none",
      }}>
        {/* Progress bar */}
        <div style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
          <div style={{
            height: "100%", width: `${progress * 100}%`,
            background: "rgba(220,60,60,0.7)", transition: "width 0.1s linear",
          }} />
        </div>
        <div style={{
          padding: "12px 24px", display: "flex", alignItems: "center", gap: 16,
          flexWrap: "wrap", justifyContent: "center",
        }}>
        {/* Elapsed time */}
        <div style={{
          color: elapsed > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)",
          fontSize: 15, fontFamily: "monospace", fontWeight: 600,
          minWidth: 44, textAlign: "center", letterSpacing: 1,
        }}>
          {formatTime(elapsed)}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)" }} />

        {/* Play/Pause */}
        <button onClick={() => setPlaying(p => !p)} style={{
          background: playing ? "rgba(220,60,60,0.8)" : "rgba(255,255,255,0.12)",
          color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px",
          fontSize: 14, cursor: "pointer", fontFamily: "monospace", fontWeight: 600,
          minWidth: 90, transition: "background 0.2s",
        }}>
          {playing ? "\u23F8 PAUSE" : "\u25B6 PLAY"}
        </button>

        {/* Reset */}
        <button onClick={reset} style={{
          background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)",
          border: "none", borderRadius: 8, padding: "8px 16px",
          fontSize: 14, cursor: "pointer", fontFamily: "monospace",
        }}>
          {"\u21BA RESET"}
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)" }} />

        {/* Speed */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 }}>
            SPEED
          </span>
          <input
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={0.05}
            value={speed}
            onChange={e => setSpeed(+e.target.value)}
            style={{ width: 120, accentColor: "rgba(220,60,60,0.8)", cursor: "pointer" }}
          />
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "monospace", minWidth: 32, textAlign: "right" }}>
            {speed.toFixed(1)}x
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)" }} />

        {/* Font size */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "monospace", letterSpacing: 1 }}>
            SIZE
          </span>
          <button onClick={() => setFontSize(s => Math.max(20, s - 4))} style={{
            background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)",
            border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 14,
            cursor: "pointer", fontFamily: "monospace",
          }}>{"A\u2212"}</button>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "monospace", minWidth: 28, textAlign: "center" }}>
            {fontSize}
          </span>
          <button onClick={() => setFontSize(s => Math.min(80, s + 4))} style={{
            background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)",
            border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 14,
            cursor: "pointer", fontFamily: "monospace",
          }}>A+</button>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)" }} />

        {/* Mirror */}
        <button onClick={() => setMirrored(m => !m)} style={{
          background: mirrored ? "rgba(100,160,255,0.25)" : "rgba(255,255,255,0.08)",
          color: mirrored ? "rgba(100,160,255,0.9)" : "rgba(255,255,255,0.5)",
          border: mirrored ? "1px solid rgba(100,160,255,0.3)" : "1px solid transparent",
          borderRadius: 8, padding: "8px 14px", fontSize: 12,
          cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s",
        }}>
          {"\u21C4 MIRROR"}
        </button>

        {/* Keyboard hints */}
        <div style={{
          color: "rgba(255,255,255,0.2)", fontSize: 10, fontFamily: "monospace",
          marginLeft: 8, lineHeight: 1.5,
        }}>
          {"Space: play/pause \u00B7 \u2191\u2193: speed \u00B7 [ ]: font size \u00B7 R: reset \u00B7 M: mirror"}
        </div>
        </div>
      </div>
    </div>
  );
}
