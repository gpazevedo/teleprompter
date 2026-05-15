import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { parseSpeech } from "./speechUtils.js";
import { diffWords } from "./diffUtils.js";
import { C, btnSmall } from "./lib/theme.js";
import { ScanLines, Vignette, DeviceSelect, AudioLevelMeter } from "./lib/ui.jsx";
import { playTts, useAudioDevices, getAudioStream } from "./lib/audio.js";
import { FilePicker } from "./lib/FilePicker.jsx";
import { useMicTranscription } from "./transcription.js";

const WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"];
const FONT_MIN = 12;
const FONT_MAX = 28;
const FONT_STEP = 2;

// Map language code → valid edge-tts neural voice
const LANG_VOICES = {
  en: "en-US-EricNeural",
  es: "es-ES-AlvaroNeural",
  fr: "fr-FR-HenriNeural",
  de: "de-DE-ConradNeural",
  pt: "pt-BR-AntonioNeural",
  it: "it-IT-DiegoNeural",
  ja: "ja-JP-KeitaNeural",
  zh: "zh-CN-YunxiNeural",
};

const LISTEN_COLORS = {
  idle:       C.amber,
  starting:   "#ddaa00",
  listening:  "#22cc66",
  processing: "#ddaa00",
  finished:   "#4488cc",
};

export default function Tutor() {
  const [speech, setSpeech]             = useState([]);
  const [fileName, setFileName]         = useState(null);
  const [userText, setUserText]         = useState("");
  const [recognizedText, setRecognizedText] = useState("");
  const [language, setLanguage]         = useState("en");
  const [whisperModel, setWhisperModel] = useState("small");
  const [ttsPlaying, setTtsPlaying]     = useState(false);
  const [fontSize, setFontSize]         = useState(18);
  const [elapsed, setElapsed]           = useState(0);
  const [leftPct, setLeftPct]           = useState(58);
  const [topPct, setTopPct]             = useState(50);

  const { audioInputs, audioOutputs, selectedMic, setSelectedMic, selectedOutput, setSelectedOutput } = useAudioDevices();

  const mainRef     = useRef(null);
  const rightRef    = useRef(null);
  const ttsAbortRef = useRef(null);
  const micBarRef   = useRef(null);
  const intervalRef = useRef(null);

  // File loading
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleText(ev.target.result, file.name);
    reader.readAsText(file);
  };

  const handleText = (raw, name = "pasted text") => {
    const items = parseSpeech(raw);
    setSpeech(items);
    setFileName(name);
    const plainText = items
      .filter(i => i.type === "line" || i.type === "bold" || i.type === "break")
      .map(i => i.type === "break" ? "" : i.text)
      .join("\n\n")
      .replace(/(\n\n){2,}/g, "\n\n");
    setUserText(plainText);
  };

  const getStream = useCallback(() => getAudioStream(selectedMic), [selectedMic]);

  const { listenState, start, stop } = useMicTranscription({
    language,
    model: whisperModel,
    selectedMic,
    micBarRef,
    getStream,
    silenceDurationMs: 300,
    onPartial: useCallback((text) => setRecognizedText(text), []),
    onFinal:   useCallback((text) => setRecognizedText(text), []),
    onError:   useCallback(() => {}, []),
  });

  const startListening = useCallback(async () => {
    setRecognizedText("");
    setElapsed(0);
    await start();
  }, [start]);

  // Play pronunciation via TTS
  const playPronunciation = useCallback(() => {
    if (ttsPlaying) {
      ttsAbortRef.current?.abort();
      ttsAbortRef.current = null;
      setTtsPlaying(false);
      return;
    }
    const text = userText.trim();
    if (!text) return;
    setTtsPlaying(true);
    ttsAbortRef.current = playTts(
      text, LANG_VOICES[language] ?? LANG_VOICES.en,
      () => setTtsPlaying(false),
      selectedOutput || undefined,
    );
  }, [userText, language, ttsPlaying, selectedOutput]);

  // Hot-swap audio output device during TTS playback
  useEffect(() => {
    const audio = ttsAbortRef.current?.audio;
    if (audio?.setSinkId && selectedOutput) {
      audio.setSinkId(selectedOutput);
    }
  }, [selectedOutput]);

  const diff = useMemo(() => {
    if (listenState !== "finished" || !recognizedText || !userText) return null;
    return diffWords(userText, recognizedText);
  }, [listenState, recognizedText, userText]);

  const fullText = useMemo(
    () => speech.map(i => {
      if (i.type === "section") return `## ${i.text}`;
      if (i.type === "bold") return `**${i.text}**`;
      if (i.type === "break") return "---";
      return i.text;
    }).join("\n\n"),
    [speech],
  );

  // Drag handlers for vertical splitter (left/right)
  const startVDrag = useCallback((e) => {
    e.preventDefault();
    const container = mainRef.current;
    if (!container) return;
    const onMove = (ev) => {
      const rect = container.getBoundingClientRect();
      const x = (ev.clientX ?? ev.touches?.[0]?.clientX) - rect.left;
      const pct = Math.min(80, Math.max(20, (x / rect.width) * 100));
      setLeftPct(pct);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // Drag handlers for horizontal splitter (top/bottom within right)
  const startHDrag = useCallback((e) => {
    e.preventDefault();
    const container = rightRef.current;
    if (!container) return;
    const onMove = (ev) => {
      const rect = container.getBoundingClientRect();
      const y = (ev.clientY ?? ev.touches?.[0]?.clientY) - rect.top;
      const pct = Math.min(80, Math.max(20, (y / rect.height) * 100));
      setTopPct(pct);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // Timer: runs only while actively listening
  useEffect(() => {
    if (listenState === "listening") {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { clearInterval(intervalRef.current); intervalRef.current = null; };
  }, [listenState]);

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (!speech.length) {
    return <FilePicker onFile={handleFile} onText={handleText} title="Load practice text" />;
  }

  const listenColor = LISTEN_COLORS[listenState];

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      background: C.bg,
      fontFamily: "'Courier Prime', 'Courier New', monospace",
      display: "flex", flexDirection: "column", overflow: "hidden",
      color: C.text,
    }}>
      <ScanLines />
      <Vignette style={{ zIndex: 2 }} />

      {/* Top bar */}
      <div style={{
        display: "flex", gap: 14, padding: "10px 20px",
        borderBottom: `1px solid ${C.divider}`,
        background: C.bgControls,
        flexShrink: 0, zIndex: 5,
        alignItems: "center", flexWrap: "wrap",
      }}>
        <DeviceSelect label="LANG" value={language} onChange={setLanguage} options={[
          { value: "en", label: "English" }, { value: "es", label: "Spanish" },
          { value: "fr", label: "French" },  { value: "de", label: "German" },
          { value: "pt", label: "Portuguese" }, { value: "it", label: "Italian" },
          { value: "ja", label: "Japanese" }, { value: "zh", label: "Chinese" },
        ]} />

        <div style={{ width: 1, height: 20, background: C.divider }} />

        <DeviceSelect label="WHISPER" value={whisperModel} onChange={setWhisperModel}
          options={WHISPER_MODELS.map(m => ({ value: m, label: m }))} />

        <div style={{ width: 1, height: 20, background: C.divider }} />

        <DeviceSelect label="MIC" value={selectedMic} onChange={setSelectedMic}
          options={audioInputs.map(d => ({ value: d.deviceId, label: d.label }))}
          maxWidth={200} />

        <div style={{ width: 1, height: 20, background: C.divider }} />

        <DeviceSelect label="OUTPUT" value={selectedOutput} onChange={setSelectedOutput}
          options={audioOutputs.map(d => ({ value: d.deviceId, label: d.label }))}
          maxWidth={200} />

        <label style={{
          cursor: "pointer", color: C.textFaint, fontSize: 11,
          letterSpacing: 1, textDecoration: "underline dotted", marginLeft: "auto",
        }}>
          {fileName ?? "load file"}
          <input type="file" accept=".txt" onChange={handleFile} style={{ display: "none" }} />
        </label>
      </div>

      {/* Main content: two-column layout */}
      <div ref={mainRef} style={{
        flex: 1, display: "flex", overflow: "hidden",
        zIndex: 3, position: "relative",
      }}>
        {/* Left: Full text from file */}
        <div style={{
          flex: `0 0 ${leftPct}%`, overflow: "auto", padding: "16px 20px",
          scrollbarWidth: "thin",
          scrollbarColor: `${C.amberDim} transparent`,
        }}>
          <div style={{
            fontSize: 11, letterSpacing: 2, color: C.section,
            marginBottom: 12, textTransform: "uppercase",
          }}>
            Reference Text
          </div>
          <pre style={{
            fontSize, lineHeight: 1.7, color: C.text,
            whiteSpace: "pre-wrap", wordWrap: "break-word",
            fontFamily: "'EB Garamond', Georgia, serif",
            margin: 0,
          }}>
            {fullText}
          </pre>
        </div>

        {/* Vertical drag handle */}
        <div
          onMouseDown={startVDrag}
          style={{
            width: 5, flexShrink: 0, cursor: "col-resize",
            background: C.divider,
            transition: "background 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.background = C.amber}
          onMouseLeave={e => e.currentTarget.style.background = C.divider}
        />

        {/* Right: user text + recognized text */}
        <div ref={rightRef} style={{
          flex: 1, display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* User's editable text */}
          <div style={{
            flex: `0 0 ${topPct}%`, display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{
              fontSize: 11, letterSpacing: 2, color: C.section,
              padding: "12px 16px 0", textTransform: "uppercase",
            }}>
              Your Text
            </div>
            <textarea
              value={userText}
              onChange={e => setUserText(e.target.value)}
              style={{
                flex: 1, resize: "none",
                background: "transparent", color: C.text,
                border: "none", outline: "none",
                padding: "8px 16px 16px",
                fontSize, lineHeight: 1.6,
                fontFamily: "'EB Garamond', Georgia, serif",
                scrollbarWidth: "thin",
                scrollbarColor: `${C.amberDim} transparent`,
              }}
              placeholder="Type or paste text to practice..."
            />
          </div>

          {/* Horizontal drag handle */}
          <div
            onMouseDown={startHDrag}
            style={{
              height: 5, flexShrink: 0, cursor: "row-resize",
              background: C.divider,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.amber}
            onMouseLeave={e => e.currentTarget.style.background = C.divider}
          />

          {/* Recognized text (read-only) */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{
              fontSize: 11, letterSpacing: 2, color: C.section,
              padding: "12px 16px 0", textTransform: "uppercase",
            }}>
              Recognized (Whisper)
              {listenState === "listening" && recognizedText && (
                <span style={{ color: C.amberDim, fontSize: 9, marginLeft: 8, letterSpacing: 1 }}>
                  PARTIAL
                </span>
              )}
              {diff && (
                <span style={{ fontSize: 9, marginLeft: 8, letterSpacing: 1 }}>
                  <span style={{ color: "#22cc66" }}>match</span>
                  {" · "}
                  <span style={{ color: "#ffaa22" }}>extra</span>
                  {" · "}
                  <span style={{ color: "#ff4466", textDecoration: "line-through" }}>missing</span>
                </span>
              )}
            </div>
            <div style={{
              flex: 1, overflow: "auto", padding: "8px 16px 16px",
              fontSize, lineHeight: 1.6,
              color: listenState === "finished" ? C.text : C.textFaint,
              fontFamily: "'EB Garamond', Georgia, serif",
              scrollbarWidth: "thin",
              scrollbarColor: `${C.amberDim} transparent`,
              fontStyle: listenState === "listening" ? "italic" : "normal",
              whiteSpace: "pre-wrap",
            }}>
              {diff ? (
                diff.map((d, i) => (
                  <span key={i} style={{
                    color: d.type === "match" ? "#22cc66"
                         : d.type === "missing" ? "#ff4466"
                         : "#ffaa22",
                    textDecoration: d.type === "missing" ? "line-through" : "none",
                    opacity: d.type === "missing" ? 0.7 : 1,
                  }}>
                    {d.word}{" "}
                  </span>
                ))
              ) : (
                recognizedText || "Speak to see transcription..."
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div style={{
        display: "flex", gap: 12, padding: "10px 20px",
        borderTop: `1px solid ${C.divider}`,
        background: C.bgControls,
        flexShrink: 0, zIndex: 5,
        alignItems: "center", justifyContent: "center",
        flexWrap: "wrap",
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

        {listenState === "idle" || listenState === "finished" ? (
          <button onClick={startListening} style={{
            ...btnSmall,
            background: `${listenColor}22`,
            color: listenColor,
            border: `1px solid ${listenColor}44`,
            padding: "7px 20px", fontSize: 13, fontWeight: 700, letterSpacing: 1,
          }}>
            ◉ START SPEAKING
          </button>
        ) : (
          <button
            onClick={listenState === "listening" ? stop : undefined}
            style={{
              ...btnSmall,
              background: `${listenColor}22`,
              color: listenColor,
              border: `1px solid ${listenColor}44`,
              padding: "7px 20px", fontSize: 13, fontWeight: 700, letterSpacing: 1,
              animation: listenState === "listening" ? "pulse 1.5s infinite" : "none",
              cursor: listenState === "listening" ? "pointer" : "wait",
            }}
          >
            {listenState === "starting" ? "⏳ STARTING..."
              : listenState === "processing" ? "⏳ PROCESSING..."
              : "◼ STOP LISTENING"}
          </button>
        )}

        {listenState === "listening" && <AudioLevelMeter barRef={micBarRef} />}

        <div style={{ width: 1, height: 24, background: C.divider }} />

        {/* Play pronunciation */}
        <button onClick={playPronunciation} style={{
          ...btnSmall,
          background: ttsPlaying ? "rgba(30,180,110,0.15)" : "rgba(255,255,255,0.05)",
          color: ttsPlaying ? "#22cc66" : "rgba(255,255,255,0.45)",
          border: ttsPlaying ? "1px solid rgba(30,180,110,0.3)" : "1px solid rgba(255,255,255,0.08)",
          padding: "7px 20px", fontSize: 13, fontWeight: 700, letterSpacing: 1,
        }}>
          {ttsPlaying ? "◼ STOP" : "◉ SYSTEM SPEAK"}
        </button>

        <div style={{ width: 1, height: 24, background: C.divider }} />

        {/* Font size */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>SIZE</span>
          <button onClick={() => setFontSize(s => Math.max(FONT_MIN, s - FONT_STEP))} style={btnSmall}>A−</button>
          <span style={{ color: C.text, fontSize: 12, minWidth: 24, textAlign: "center" }}>{fontSize}</span>
          <button onClick={() => setFontSize(s => Math.min(FONT_MAX, s + FONT_STEP))} style={btnSmall}>A+</button>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}</style>
      </div>
    </div>
  );
}
