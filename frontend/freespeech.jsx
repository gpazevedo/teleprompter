import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  C, btnSmall, ScanLines, Vignette,
  useAudioDevices, DeviceSelect, AudioLevelMeter,
} from "./shared.jsx";

const WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v3"];
const SILENCE_THRESHOLD = 0.04;

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
  const [listenState, setListenState]   = useState("idle");
  const [fontSize, setFontSize]         = useState(22);

  const { audioInputs, selectedMic, setSelectedMic } = useAudioDevices();

  const wsRef         = useRef(null);
  const recorderRef   = useRef(null);
  const streamRef     = useRef(null);
  const analyserRef   = useRef(null);
  const levelRafRef   = useRef(null);
  const micBarRef     = useRef(null);
  const textAreaRef   = useRef(null);

  const startLevelMeter = useCallback((stream, silenceDurationMs = 300) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = { ctx, analyser, silenceStart: null, pauseSent: false };

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const level = avg / 128;

      if (micBarRef.current) {
        micBarRef.current.style.width = `${Math.min(100, level * 100)}%`;
        micBarRef.current.style.background = level > 0.7
          ? "linear-gradient(to right, #22cc66, #ff4422)"
          : level > 0.4
            ? "linear-gradient(to right, #22cc66, #ffaa22)"
            : "#22cc66";
        micBarRef.current.style.boxShadow = level > 0.3 ? "0 0 6px rgba(34,204,102,0.4)" : "none";
      }

      const a = analyserRef.current;
      if (a) {
        const now = performance.now();
        if (level < SILENCE_THRESHOLD) {
          if (a.silenceStart === null) a.silenceStart = now;
          if (!a.pauseSent && now - a.silenceStart >= silenceDurationMs) {
            a.pauseSent = true;
            const ws = wsRef.current;
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "pause_detected" }));
            }
          }
        } else {
          a.silenceStart = null;
          a.pauseSent = false;
        }
      }

      levelRafRef.current = requestAnimationFrame(tick);
    };
    levelRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
    analyserRef.current?.ctx.close();
    analyserRef.current = null;
    if (micBarRef.current) micBarRef.current.style.width = "0%";
  }, []);

  const cleanup = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    stopLevelMeter();
  }, [stopLevelMeter]);

  const startListening = useCallback(async () => {
    setListenState("starting");
    setPartial("");

    const constraints = selectedMic
      ? { audio: { deviceId: { exact: selectedMic } } }
      : { audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    streamRef.current = stream;
    startLevelMeter(stream);

    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${wsProto}//${location.host}/api/transcribe`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "start", language, model: whisperModel }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "ready") {
        setListenState("listening");
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
        recorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(ev.data);
        };
        recorder.start(1000);
      } else if (msg.type === "transcript") {
        setPartial(msg.text);
        if (msg.is_final) {
          setTranscript(prev => {
            const sep = prev ? (prev.trimEnd().endsWith(".") ? "\n" : " ") : "";
            return prev + sep + msg.text;
          });
          setPartial("");
          setListenState("finished");
          ws.close();
        }
      } else if (msg.type === "error") {
        console.error("Transcription error:", msg.message);
        cleanup();
        setListenState("idle");
      }
    };

    ws.onerror = () => { cleanup(); setListenState("idle"); };
    ws.onclose = () => { cleanup(); };
  }, [language, whisperModel, startLevelMeter, cleanup, selectedMic]);

  const stopListening = useCallback(() => {
    const ws = wsRef.current;
    const recorder = recorderRef.current;

    stopLevelMeter();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;

    const sendStop = () => {
      if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "stop" }));
    };
    if (recorder && recorder.state === "recording") {
      recorder.onstop = sendStop;
      recorder.stop();
    } else {
      sendStop();
    }

    setListenState("processing");
  }, [stopLevelMeter]);

  // Scroll to bottom of textarea when transcript grows
  useEffect(() => {
    const el = textAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, partial]);

  // Hot-swap mic when selection changes during listening
  useEffect(() => {
    if (listenState !== "listening" || !selectedMic) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    (async () => {
      cleanup();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: selectedMic } },
      });
      streamRef.current = stream;
      startLevelMeter(stream);
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      recorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(ev.data);
      };
      recorder.start(1000);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMic]);

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
            onClick={listenState === "listening" ? stopListening : undefined}
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
          onClick={() => { setTranscript(""); setPartial(""); }}
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
