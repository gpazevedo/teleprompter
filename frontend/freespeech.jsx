import React, { useState, useRef, useCallback, useEffect } from "react";
import { C, btnSmall } from "./lib/theme.js";
import { ScanLines, Vignette, DeviceSelect, AudioLevelMeter } from "./lib/ui.jsx";
import { getAudioStream, useAudioDevices } from "./lib/audio.js";
import { useMicTranscription } from "./transcription.js";

const WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"];

const LISTEN_COLORS = {
  idle:       C.amber,
  starting:   "#ddaa00",
  listening:  "#22cc66",
  processing: "#ddaa00",
  finished:   "#4488cc",
};

export default function FreeSpeech() {
  const [transcript, setTranscript]     = useState(""); // accumulated across sessions
  const [partial, setPartial]           = useState("");  // current partial text
  const [language, setLanguage]         = useState("en");
  const [whisperModel, setWhisperModel] = useState("small");
  const [fontSize, setFontSize]         = useState(22);
  const [elapsed, setElapsed]           = useState(0);

  const { audioInputs, selectedMic, setSelectedMic } = useAudioDevices();

  const micBarRef   = useRef(null);
  const textAreaRef = useRef(null);
  const intervalRef = useRef(null);

  const getStream = useCallback(() => getAudioStream(selectedMic), [selectedMic]);

  const onPartial = useCallback((text) => setPartial(text), []);
  const onFinal   = useCallback((text) => {
    setTranscript(prev => {
      const sep = prev ? (prev.trimEnd().endsWith(".") ? "\n" : " ") : "";
      return prev + sep + text;
    });
    setPartial("");
  }, []);

  const { listenState, start, stop } = useMicTranscription({
    language,
    model: whisperModel,
    selectedMic,
    micBarRef,
    getStream,
    silenceDurationMs: 300,
    onPartial,
    onFinal,
    onError: useCallback(() => {}, []),
  });

  const startListening = useCallback(async () => {
    setPartial("");
    await start();
  }, [start]);

  // Scroll to bottom of transcript area as text grows
  useEffect(() => {
    const el = textAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, partial]);

  // Timer: accumulates while actively listening, resets with CLEAR
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

  const listenColor = LISTEN_COLORS[listenState];
  const displayText = transcript + (partial ? (transcript ? (transcript.trimEnd().endsWith(".") ? "\n" : " ") : "") + partial : "");

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
      </div>

      {/* Transcript area */}
      <div style={{
        flex: 1, overflow: "auto", padding: "24px 32px",
        zIndex: 3, position: "relative",
        scrollbarWidth: "thin",
        scrollbarColor: `${C.amberDim} transparent`,
      }} ref={textAreaRef}>
        {displayText ? (
          <p style={{
            fontSize, lineHeight: 1.8,
            fontFamily: "'EB Garamond', Georgia, serif",
            color: C.text,
            margin: 0, whiteSpace: "pre-wrap", wordWrap: "break-word",
          }}>
            {transcript}
            {partial && (
              <span style={{ color: C.amberDim, fontStyle: "italic" }}>
                {transcript ? (transcript.trimEnd().endsWith(".") ? "\n" : " ") : ""}{partial}
              </span>
            )}
          </p>
        ) : (
          <p style={{
            fontSize, lineHeight: 1.8,
            fontFamily: "'EB Garamond', Georgia, serif",
            color: C.textFaint, fontStyle: "italic",
            margin: 0,
          }}>
            Press START SPEAKING and begin talking. Your words will appear here.
          </p>
        )}
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

        <button
          onClick={() => { setTranscript(""); setPartial(""); setElapsed(0); }}
          style={{
            ...btnSmall,
            padding: "7px 16px", fontSize: 13, letterSpacing: 1,
            opacity: displayText ? 1 : 0.3,
          }}
          disabled={!displayText}
        >
          CLEAR
        </button>

        <div style={{ width: 1, height: 24, background: C.divider }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>SIZE</span>
          <button onClick={() => setFontSize(s => Math.max(14, s - 2))} style={btnSmall}>A−</button>
          <span style={{ color: C.text, fontSize: 12, minWidth: 24, textAlign: "center" }}>{fontSize}</span>
          <button onClick={() => setFontSize(s => Math.min(40, s + 2))} style={btnSmall}>A+</button>
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
