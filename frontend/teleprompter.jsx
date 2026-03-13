import React, { useState, useEffect, useRef, useCallback } from "react";
import { parseSpeech, countSentences, buildItemTimings } from "./speechUtils.js";
import { C, btnSmall, ScanLines, Vignette, FilePicker, b64ToBlob, useAudioDevices, DeviceSelect } from "./shared.jsx";

// ─── Constants ────────────────────────────────────────────────────────────────

const SPEED_MIN     = 0.1;
const SPEED_MAX     = 3.0;
const SPEED_DEFAULT = 1.2;
const DEFAULT_VOICE = "en-US-EricNeural";
const FONT_MIN      = 24;
const FONT_MAX      = 96;
const FONT_STEP     = 4;

const decFontSize = s => Math.max(FONT_MIN, s - FONT_STEP);
const incFontSize = s => Math.min(FONT_MAX, s + FONT_STEP);

// ─── Component ────────────────────────────────────────────────────────────────

export default function Teleprompter() {
  // Speech content
  const [speech, setSpeech]       = useState([]);
  const [fileName, setFileName]   = useState(null);

  // Scroll / playback
  const [playing, setPlaying]     = useState(false);
  const [speed, setSpeed]         = useState(SPEED_DEFAULT);
  const [mirrored, setMirrored]   = useState(false);
  const [fontSize, setFontSize]   = useState(40);
  const [elapsed, setElapsed]     = useState(0);
  const [progress, setProgress]   = useState(0);

  // TTS
  const [voices, setVoices]       = useState([]);
  const [voice, setVoice]         = useState(DEFAULT_VOICE);
  const [ttsActive, setTtsActive] = useState(false);

  // Refs — scroll animation
  const scrollRef   = useRef(null);
  const animRef     = useRef(null);
  const lastTimeRef = useRef(null);
  const intervalRef = useRef(null);
  const speedRef    = useRef(speed);
  const accumRef    = useRef(0);

  // Audio devices
  const { audioOutputs, selectedOutput, setSelectedOutput } = useAudioDevices();

  // Refs — TTS
  const audioRef     = useRef(null);
  const ttsRafRef    = useRef(null); // rAF id for scroll sync loop
  const paraElemsRef = useRef([]);   // DOM element per speech item
  const abortRef      = useRef(null); // AbortController.abort fn for in-flight fetch

  // ── Fetch voices once ────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/voices")
      .then(r => r.json())
      .then(data => setVoices(data))
      .catch(() => {}); // backend not available in pure static dev
  }, []);

  // ── Scroll animation ─────────────────────────────────────────────────────

  useEffect(() => { speedRef.current = speed; }, [speed]);

  const scrollTick = useCallback((timestamp) => {
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
    animRef.current = requestAnimationFrame(scrollTick);
  }, []);

  useEffect(() => {
    if (playing && !ttsActive) {
      lastTimeRef.current = null;
      animRef.current = requestAnimationFrame(scrollTick);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, ttsActive, scrollTick]);

  // ── Progress tracking ────────────────────────────────────────────────────

  useEffect(() => {
    if (playing || ttsActive) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { clearInterval(intervalRef.current); intervalRef.current = null; };
  }, [playing, ttsActive]);

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

  // ── File picker ──────────────────────────────────────────────────────────

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setSpeech(parseSpeech(ev.target.result));
      setFileName(file.name);
      reset();
    };
    reader.readAsText(file);
  };

  // ── Scroll helpers ───────────────────────────────────────────────────────

  const scrollToItem = useCallback((itemIdx) => {
    const el = scrollRef.current;
    const target = paraElemsRef.current[itemIdx];
    if (!el || !target) return;
    el.scrollTop = target.offsetTop - el.clientHeight * 0.38;
  }, []);

  /** Index of the speech item currently closest to the guide line. */
  const itemAtGuide = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return 0;
    const guideTop = el.scrollTop + el.clientHeight * 0.38;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < paraElemsRef.current.length; i++) {
      const elem = paraElemsRef.current[i];
      if (!elem) continue;
      const dist = Math.abs(elem.offsetTop - guideTop);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }, []);

  // ── TTS ──────────────────────────────────────────────────────────────────

  const stopTts = useCallback(() => {
    if (abortRef.current) { abortRef.current(); abortRef.current = null; }
    if (ttsRafRef.current) { cancelAnimationFrame(ttsRafRef.current); ttsRafRef.current = null; }
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current._blobUrl) URL.revokeObjectURL(audioRef.current._blobUrl);
      audioRef.current = null;
    }
    setTtsActive(false);
  }, []);

  // ── Hot-swap audio output device during TTS playback ─────────────────────

  useEffect(() => {
    const audio = audioRef.current;
    if (audio?.setSinkId && selectedOutput) {
      audio.setSinkId(selectedOutput);
    }
  }, [selectedOutput]);

  // ── Cleanup on unmount (after stopTts is declared) ───────────────────────

  useEffect(() => () => stopTts(), [stopTts]);

  const speak = useCallback(async () => {
    if (ttsActive) { stopTts(); return; }

    const selection = window.getSelection()?.toString().trim();
    const isSelection = Boolean(selection);

    let textToSpeak;
    let startIdx = 0;
    let speakableItems = [];

    if (isSelection) {
      textToSpeak = selection;
    } else {
      startIdx = itemAtGuide();
      speakableItems = speech
        .slice(startIdx)
        .map((item, offset) => ({ ...item, absIdx: startIdx + offset }))
        .filter(item => item.type !== "break");
      if (!speakableItems.length) return;
      textToSpeak = speakableItems.map(i => i.text).join("\n\n");
    }

    setTtsActive(true);
    setPlaying(false); // TTS drives scroll; pause visual RAF loop

    const ctrl = new AbortController();
    abortRef.current = () => ctrl.abort();

    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSpeak, voice }),
        signal: ctrl.signal,
      });

      // Bail out if stopTts() was called while fetch was in-flight
      if (ctrl.signal.aborted) return;

      const { audio_b64, boundaries } = await res.json();

      if (ctrl.signal.aborted) return;

      const blobUrl = b64ToBlob(audio_b64);
      const audio = new Audio(blobUrl);
      audio._blobUrl = blobUrl;
      if (selectedOutput && audio.setSinkId) {
        await audio.setSinkId(selectedOutput);
      }
      audio.playbackRate = speedRef.current;
      audioRef.current = audio;

      audio.addEventListener("ended", () => stopTts(), { once: true });

      // Build flat timings array: [{absIdx, startMs}] for rAF interpolation
      const scrollTimings = (!isSelection && speakableItems.length && boundaries.length)
        ? buildItemTimings(speakableItems, boundaries).map(({ itemIdx, startMs }) => ({
            absIdx: speakableItems[itemIdx]?.absIdx ?? startIdx + itemIdx,
            startMs,
          }))
        : [];

      // Pre-compute targetScrollTop for each timing using getBoundingClientRect,
      // which is reliable regardless of offsetParent chain.
      const scroller = scrollRef.current;
      if (scroller && scrollTimings.length) {
        const scrollerRect = scroller.getBoundingClientRect();
        const vh = scroller.clientHeight;
        for (const timing of scrollTimings) {
          const elem = paraElemsRef.current[timing.absIdx];
          if (elem) {
            const elemRect = elem.getBoundingClientRect();
            timing.targetScrollTop = elemRect.top - scrollerRect.top + scroller.scrollTop - vh * 0.38;
          }
        }

      }

      // rAF loop: interpolate scrollTop between pre-computed positions using audio.currentTime
      if (scrollTimings.length) {
        const syncScroll = () => {
          const el = scrollRef.current;
          const audio = audioRef.current;
          if (!el || !audio) return;

          if (audio.playbackRate !== speedRef.current) audio.playbackRate = speedRef.current;
          const currentMs = audio.currentTime * 1000;

          // Find which segment we're in
          let seg = 0;
          for (let i = 1; i < scrollTimings.length; i++) {
            if (currentMs >= scrollTimings[i].startMs) seg = i;
            else break;
          }

          const curr = scrollTimings[seg];
          const next  = scrollTimings[seg + 1];
          const currTop = curr.targetScrollTop;

          if (currTop == null) { ttsRafRef.current = requestAnimationFrame(syncScroll); return; }

          if (next?.targetScrollTop != null) {
            const t = Math.max(0, Math.min(1,
              (currentMs - curr.startMs) / (next.startMs - curr.startMs)
            ));
            el.scrollTop = currTop + (next.targetScrollTop - currTop) * t;
          } else {
            el.scrollTop = currTop;
          }

          ttsRafRef.current = requestAnimationFrame(syncScroll);
        };
        ttsRafRef.current = requestAnimationFrame(syncScroll);
      }

      audio.play();
    } catch (err) {
      if (err.name !== "AbortError") setTtsActive(false);
    } finally {
      abortRef.current = null;
    }
  }, [ttsActive, stopTts, speech, voice, itemAtGuide, selectedOutput]);

  // ── Reset ────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopTts();
    setPlaying(false);
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    setElapsed(0);
    setProgress(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [stopTts]);

  // ── Keyboard ─────────────────────────────────────────────────────────────

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const handleKey = useCallback((e) => {
    if (e.code === "Space")        { e.preventDefault(); setPlaying(p => !p); }
    if (e.code === "ArrowUp")      { e.preventDefault(); setSpeed(s => Math.min(SPEED_MAX, +(s + 0.1).toFixed(2))); }
    if (e.code === "ArrowDown")    { e.preventDefault(); setSpeed(s => Math.max(SPEED_MIN, +(s - 0.1).toFixed(2))); }
    if (e.code === "KeyR")         { e.preventDefault(); reset(); }
    if (e.code === "KeyM")         { e.preventDefault(); setMirrored(m => !m); }
    if (e.code === "KeyT")         { e.preventDefault(); speak(); }
    if (e.code === "BracketRight") { e.preventDefault(); setFontSize(incFontSize); }
    if (e.code === "BracketLeft")  { e.preventDefault(); setFontSize(decFontSize); }
  }, [reset, speak]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (!speech.length) {
    return <FilePicker onFile={handleFile} />;
  }

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      background: C.bg,
      fontFamily: "'EB Garamond', Georgia, serif",
      display: "flex", flexDirection: "column", overflow: "hidden",
      color: C.text,
    }}>

      {/* ── Scroll wrapper ── */}
      <div style={{ flex: 1, position: "relative", display: "flex", overflow: "hidden" }}>

        <ScanLines />
        <Vignette style={{ zIndex: 18 }} />
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "32%",
          background: `linear-gradient(to bottom, ${C.bg} 0%, ${C.bg} 8%, transparent 100%)`,
          zIndex: 15, pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 28, height: "26%",
          background: `linear-gradient(to top, ${C.bg} 0%, ${C.bg} 5%, transparent 100%)`,
          zIndex: 15, pointerEvents: "none",
        }} />

        {/* Guide line */}
        <div style={{
          position: "absolute", top: "38%", left: 0, right: 28, height: 1,
          background: `linear-gradient(to right, transparent 0%, ${C.amber} 6%, ${C.amber} 94%, transparent 100%)`,
          boxShadow: `0 0 8px ${C.amber}, 0 0 28px rgba(255,170,34,0.3), 0 0 60px rgba(255,170,34,0.1)`,
          zIndex: 16, pointerEvents: "none",
        }} />
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
            flex: 1, overflowY: "auto",
            padding: "38vh 80px 65vh 80px",
            scrollBehavior: "auto",
            transform: mirrored ? "scaleX(-1)" : "none",
            scrollbarWidth: "none",
            zIndex: 1,
          }}
        >
          <style>{`div::-webkit-scrollbar { display: none; }`}</style>

          {speech.map((item, i) => {
            const setRef = el => { paraElemsRef.current[i] = el; };

            if (item.type === "break") {
              return <div key={i} style={{ height: 72 }} />;
            }
            if (item.type === "section") {
              return (
                <div key={i} ref={setRef} style={{
                  fontSize: Math.max(13, Math.round(fontSize * 0.34)),
                  fontFamily: "'Courier Prime', 'Courier New', monospace",
                  color: C.section,
                  letterSpacing: 6, fontWeight: 700,
                  marginBottom: 22, marginTop: 10,
                  textTransform: "uppercase",
                }}>
                  ◆&nbsp;&nbsp;{item.text}
                </div>
              );
            }
            if (item.type === "bold") {
              return (
                <p key={i} ref={setRef} style={{
                  fontSize, lineHeight: 1.5,
                  color: C.textBold, fontWeight: 700,
                  margin: "0 0 40px 0",
                  textShadow: "0 0 80px rgba(255,200,100,0.1)",
                }}>
                  {item.text}
                </p>
              );
            }
            return (
              <p key={i} ref={setRef} style={{
                fontSize, lineHeight: 1.5,
                color: C.text, fontWeight: 400,
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

      </div>

      {/* ── Controls bar ── */}
      <div style={{
        background: C.bgControls,
        borderTop: `1px solid ${C.divider}`,
        transform: mirrored ? "scaleX(-1)" : "none",
        flexShrink: 0,
      }}>
        <div style={{ height: 2, background: "rgba(255,255,255,0.04)" }}>
          <div style={{
            height: "100%", width: `${progress * 100}%`,
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

          {/* Timer */}
          <div style={{
            color: elapsed > 0 ? C.amber : C.textFaint,
            fontSize: 16, fontWeight: 700, letterSpacing: 3,
            minWidth: 52, textAlign: "center",
            textShadow: elapsed > 0 ? `0 0 12px ${C.amberFaint}` : "none",
            transition: "color 0.4s",
          }}>
            {formatTime(elapsed)}
          </div>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Play / Pause */}
          <button
            onClick={() => setPlaying(p => !p)}
            disabled={ttsActive}
            style={{
              background: playing
                ? "linear-gradient(135deg, rgba(210,90,20,0.95), rgba(255,145,20,0.85))"
                : "rgba(255,255,255,0.06)",
              color: playing ? "#fff" : ttsActive ? C.textFaint : "rgba(255,255,255,0.5)",
              border: playing ? "none" : `1px solid ${C.divider}`,
              borderRadius: 6, padding: "7px 22px",
              fontSize: 13, cursor: ttsActive ? "not-allowed" : "pointer",
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700, letterSpacing: 1, minWidth: 96,
              transition: "all 0.2s",
              boxShadow: playing ? "0 0 24px rgba(255,145,20,0.3)" : "none",
              opacity: ttsActive ? 0.4 : 1,
            }}
          >
            {playing ? "⏸ PAUSE" : "▶ PLAY"}
          </button>

          {/* Reset */}
          <button onClick={reset} style={{
            background: "transparent", color: C.textFaint,
            border: `1px solid ${C.divider}`,
            borderRadius: 6, padding: "7px 16px",
            fontSize: 13, cursor: "pointer",
            fontFamily: "'Courier Prime', monospace",
          }}>
            ↺ RESET
          </button>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* SPEAK */}
          <button
            onClick={speak}
            style={{
              background: ttsActive
                ? "linear-gradient(135deg, rgba(20,120,80,0.9), rgba(30,180,110,0.8))"
                : "rgba(255,255,255,0.06)",
              color: ttsActive ? "#fff" : "rgba(255,255,255,0.5)",
              border: ttsActive ? "none" : `1px solid ${C.divider}`,
              borderRadius: 6, padding: "7px 18px",
              fontSize: 13, cursor: "pointer",
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700, letterSpacing: 1, minWidth: 90,
              transition: "all 0.2s",
              boxShadow: ttsActive ? "0 0 20px rgba(30,180,110,0.35)" : "none",
            }}
          >
            {ttsActive ? "◼ STOP" : "◉ SPEAK"}
          </button>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Speed */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>SPEED</span>
            <input
              type="range" min={SPEED_MIN} max={SPEED_MAX} step={0.05}
              value={speed} onChange={e => setSpeed(+e.target.value)}
              style={{ width: 100, accentColor: C.amber, cursor: "pointer" }}
            />
            <span style={{ color: C.text, fontSize: 13, fontWeight: 700, minWidth: 36, textAlign: "right", letterSpacing: 1 }}>
              {speed.toFixed(1)}×
            </span>
          </div>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Font size */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>SIZE</span>
            <button onClick={() => setFontSize(decFontSize)} style={btnSmall}>A−</button>
            <span style={{ color: C.text, fontSize: 12, minWidth: 28, textAlign: "center" }}>{fontSize}</span>
            <button onClick={() => setFontSize(incFontSize)} style={btnSmall}>A+</button>
          </div>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Voice selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>VOICE</span>
            <select
              value={voice}
              onChange={e => setVoice(e.target.value)}
              style={{
                background: "#111008", color: C.text,
                border: `1px solid ${C.divider}`,
                borderRadius: 5, padding: "4px 6px",
                fontSize: 11, cursor: "pointer",
                fontFamily: "'Courier Prime', monospace",
                maxWidth: 160,
              }}
            >
              {voices.length === 0
                ? <option value={DEFAULT_VOICE}>{DEFAULT_VOICE}</option>
                : voices.map(v => (
                    <option key={v.name} value={v.name}>{v.name}</option>
                  ))
              }
            </select>
          </div>

          <div style={{ width: 1, height: 24, background: C.divider }} />

          {/* Output device */}
          <DeviceSelect label="OUTPUT" value={selectedOutput} onChange={setSelectedOutput}
            options={audioOutputs.map(d => ({ value: d.deviceId, label: d.label }))}
            maxWidth={160} />

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
              letterSpacing: 2, transition: "all 0.2s",
              boxShadow: mirrored ? `0 0 14px ${C.amberFaint}` : "none",
            }}
          >
            ⇄ MIRROR
          </button>

          {/* File label + hints */}
          <div style={{ color: C.textFaint, fontSize: 10, letterSpacing: 1, lineHeight: 1.7, marginLeft: 4 }}>
            <label style={{ cursor: "pointer", textDecoration: "underline dotted" }}>
              {fileName ?? "load file"}
              <input type="file" accept=".txt" onChange={handleFile} style={{ display: "none" }} />
            </label>
            <br />
            Space · ↑↓ · [ ] · T · R · M
          </div>

        </div>
      </div>
    </div>
  );
}

