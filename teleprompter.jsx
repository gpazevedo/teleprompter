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

// Amber phosphor palette
const C = {
  bg:          "#080705",
  bgControls:  "#0c0b09",
  text:        "#ddd0b4",
  textBold:    "#f2e8d2",
  textFaint:   "rgba(237,224,196,0.35)",
  amber:       "#ffaa22",
  amberDim:    "rgba(255,170,34,0.5)",
  amberFaint:  "rgba(255,170,34,0.15)",
  section:     "#b87830",
  divider:     "rgba(255,255,255,0.06)",
};

const btnSmall = {
  background:  "rgba(255,255,255,0.05)",
  color:       "rgba(255,255,255,0.45)",
  border:      "1px solid rgba(255,255,255,0.08)",
  borderRadius: 5,
  padding:     "3px 10px",
  fontSize:    13,
  cursor:      "pointer",
  fontFamily:  "'Courier Prime', 'Courier New', monospace",
};

export default function Teleprompter() {
  const [speech, setSpeech]     = useState([]);
  const [playing, setPlaying]   = useState(false);
  const [speed, setSpeed]       = useState(SPEED_DEFAULT);
  const [mirrored, setMirrored] = useState(false);
  const [fontSize, setFontSize] = useState(40);
  const [elapsed, setElapsed]   = useState(0);
  const [progress, setProgress] = useState(0);

  const scrollRef   = useRef(null);
  const animRef     = useRef(null);
  const lastTimeRef = useRef(null);
  const intervalRef = useRef(null);
  const speedRef    = useRef(speed);
  const accumRef    = useRef(0);

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
    if (e.code === "Space")        { e.preventDefault(); setPlaying(p => !p); }
    if (e.code === "ArrowUp")      { e.preventDefault(); setSpeed(s => Math.min(SPEED_MAX, +(s + 0.1).toFixed(2))); }
    if (e.code === "ArrowDown")    { e.preventDefault(); setSpeed(s => Math.max(SPEED_MIN, +(s - 0.1).toFixed(2))); }
    if (e.code === "KeyR")         { e.preventDefault(); reset(); }
    if (e.code === "KeyM")         { e.preventDefault(); setMirrored(m => !m); }
    if (e.code === "BracketRight") { e.preventDefault(); setFontSize(s => Math.min(96, s + 4)); }
    if (e.code === "BracketLeft")  { e.preventDefault(); setFontSize(s => Math.max(24, s - 4)); }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: C.bg,
      fontFamily: "'EB Garamond', Georgia, serif",
      display: "flex", flexDirection: "column", overflow: "hidden",
      color: C.text,
    }}>

      {/* ── Scroll wrapper (relative container for all overlays) ── */}
      <div style={{
        flex: 1,
        position: "relative",
        display: "flex",
        overflow: "hidden",
      }}>

        {/* Scan-line texture (subtle phosphor feel) */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none",
          background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.055) 3px, rgba(0,0,0,0.055) 4px)",
        }} />

        {/* Vignette — darkens corners, spotlights the reading zone */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 18, pointerEvents: "none",
          background: "radial-gradient(ellipse 110% 100% at 50% 45%, transparent 38%, rgba(4,3,2,0.65) 100%)",
        }} />

        {/* Top fade — text rises out of darkness */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "32%",
          background: `linear-gradient(to bottom, ${C.bg} 0%, ${C.bg} 8%, transparent 100%)`,
          zIndex: 15, pointerEvents: "none",
        }} />

        {/* Bottom fade — text descends into darkness */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 28, height: "26%",
          background: `linear-gradient(to top, ${C.bg} 0%, ${C.bg} 5%, transparent 100%)`,
          zIndex: 15, pointerEvents: "none",
        }} />

        {/* Guide line — amber glow, the speaker's eye-rest point */}
        <div style={{
          position: "absolute", top: "38%", left: 0, right: 28, height: 1,
          background: `linear-gradient(to right, transparent 0%, ${C.amber} 6%, ${C.amber} 94%, transparent 100%)`,
          boxShadow: `0 0 8px ${C.amber}, 0 0 28px rgba(255,170,34,0.3), 0 0 60px rgba(255,170,34,0.1)`,
          zIndex: 16, pointerEvents: "none",
        }} />

        {/* Guide dot — left anchor */}
        <div style={{
          position: "absolute", top: "38%", left: 18, zIndex: 17, pointerEvents: "none",
          transform: "translateY(-4.5px)",
          width: 9, height: 9, borderRadius: "50%",
          background: C.amber,
          boxShadow: `0 0 6px ${C.amber}, 0 0 18px rgba(255,170,34,0.6)`,
        }} />

        {/* Scroll area */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "38vh 80px 65vh 80px",
            scrollBehavior: "auto",
            transform: mirrored ? "scaleX(-1)" : "none",
            scrollbarWidth: "none",
            zIndex: 1,
          }}
        >
          <style>{`div::-webkit-scrollbar { display: none; }`}</style>

          {speech.map((item, i) => {
            if (item.type === "break") {
              return <div key={i} style={{ height: 72 }} />;
            }
            if (item.type === "section") {
              return (
                <div key={i} style={{
                  fontSize: Math.max(13, Math.round(fontSize * 0.34)),
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  color: C.section,
                  letterSpacing: 6,
                  fontWeight: 700,
                  marginBottom: 22,
                  marginTop: 10,
                  textTransform: "uppercase",
                }}>
                  ◆&nbsp;&nbsp;{item.text}
                </div>
              );
            }
            if (item.type === "bold") {
              return (
                <p key={i} style={{
                  fontSize,
                  lineHeight: 1.5,
                  color: C.textBold,
                  fontWeight: 700,
                  margin: "0 0 40px 0",
                  textShadow: "0 0 80px rgba(255,200,100,0.1)",
                }}>
                  {item.text}
                </p>
              );
            }
            return (
              <p key={i} style={{
                fontSize,
                lineHeight: 1.5,
                color: C.text,
                fontWeight: 400,
                margin: "0 0 40px 0",
              }}>
                {item.text}
              </p>
            );
          })}
        </div>

        {/* Vertical seek slider */}
        <div style={{
          width: 28, display: "flex", alignItems: "stretch",
          background: "rgba(255,255,255,0.02)",
          borderLeft: `1px solid ${C.divider}`,
          zIndex: 1,
        }}>
          <input
            type="range" min={0} max={1} step={0.001}
            value={progress}
            onChange={e => {
              const el = scrollRef.current;
              if (!el) return;
              el.scrollTop = +e.target.value * (el.scrollHeight - el.clientHeight);
            }}
            style={{
              writingMode: "vertical-lr", direction: "rtl",
              width: "100%", cursor: "pointer",
              accentColor: C.amber,
              background: "transparent", border: "none",
            }}
          />
        </div>

      </div>{/* end scroll wrapper */}

      {/* ── Controls bar ── */}
      <div style={{
        background: C.bgControls,
        borderTop: `1px solid ${C.divider}`,
        transform: mirrored ? "scaleX(-1)" : "none",
        flexShrink: 0,
      }}>

        {/* Progress bar */}
        <div style={{ height: 2, background: "rgba(255,255,255,0.04)" }}>
          <div style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: `linear-gradient(to right, ${C.amberDim}, ${C.amber})`,
            boxShadow: `0 0 8px ${C.amberFaint}`,
            transition: "width 0.12s linear",
          }} />
        </div>

        <div style={{
          padding: "10px 24px",
          display: "flex", alignItems: "center", gap: 14,
          flexWrap: "wrap", justifyContent: "center",
          fontFamily: "'Courier Prime', 'Courier New', monospace",
        }}>

          {/* Elapsed timer */}
          <div style={{
            color: elapsed > 0 ? C.amber : C.textFaint,
            fontSize: 16, fontWeight: 700, letterSpacing: 3,
            minWidth: 52, textAlign: "center",
            textShadow: elapsed > 0 ? `0 0 12px ${C.amberFaint}` : "none",
            transition: "color 0.4s, text-shadow 0.4s",
          }}>
            {formatTime(elapsed)}
          </div>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Play / Pause */}
          <button
            onClick={() => setPlaying(p => !p)}
            style={{
              background: playing
                ? "linear-gradient(135deg, rgba(210,90,20,0.95), rgba(255,145,20,0.85))"
                : "rgba(255,255,255,0.06)",
              color: playing ? "#fff" : "rgba(255,255,255,0.5)",
              border: playing ? "none" : `1px solid ${C.divider}`,
              borderRadius: 6, padding: "7px 22px",
              fontSize: 13, cursor: "pointer",
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700, letterSpacing: 1,
              minWidth: 96,
              transition: "all 0.2s",
              boxShadow: playing ? "0 0 24px rgba(255,145,20,0.3)" : "none",
            }}
          >
            {playing ? "⏸ PAUSE" : "▶ PLAY"}
          </button>

          {/* Reset */}
          <button
            onClick={reset}
            style={{
              background: "transparent",
              color: C.textFaint,
              border: `1px solid ${C.divider}`,
              borderRadius: 6, padding: "7px 16px",
              fontSize: 13, cursor: "pointer",
              fontFamily: "'Courier Prime', monospace",
              transition: "color 0.2s",
            }}
          >
            ↺ RESET
          </button>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Speed */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>SPEED</span>
            <input
              type="range" min={SPEED_MIN} max={SPEED_MAX} step={0.05}
              value={speed}
              onChange={e => setSpeed(+e.target.value)}
              style={{ width: 110, accentColor: C.amber, cursor: "pointer" }}
            />
            <span style={{
              color: C.text, fontSize: 13, fontWeight: 700,
              minWidth: 36, textAlign: "right", letterSpacing: 1,
            }}>
              {speed.toFixed(1)}×
            </span>
          </div>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Font size */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>SIZE</span>
            <button onClick={() => setFontSize(s => Math.max(24, s - 4))} style={btnSmall}>A−</button>
            <span style={{ color: C.text, fontSize: 12, minWidth: 28, textAlign: "center" }}>{fontSize}</span>
            <button onClick={() => setFontSize(s => Math.min(96, s + 4))} style={btnSmall}>A+</button>
          </div>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Mirror */}
          <button
            onClick={() => setMirrored(m => !m)}
            style={{
              background: mirrored ? C.amberFaint : "transparent",
              color: mirrored ? C.amber : C.textFaint,
              border: `1px solid ${mirrored ? C.amberDim : C.divider}`,
              borderRadius: 6, padding: "7px 14px",
              fontSize: 11, cursor: "pointer",
              fontFamily: "'Courier Prime', monospace",
              letterSpacing: 2,
              transition: "all 0.2s",
              boxShadow: mirrored ? `0 0 14px ${C.amberFaint}` : "none",
            }}
          >
            ⇄ MIRROR
          </button>

          {/* Keyboard hints */}
          <div style={{
            color: "rgba(255,255,255,0.17)", fontSize: 10,
            letterSpacing: 1, marginLeft: 4, lineHeight: 1.7,
          }}>
            Space · ↑↓ · [ ] · R · M
          </div>

        </div>
      </div>

    </div>
  );
}
