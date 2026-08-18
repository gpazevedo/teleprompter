import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { diffWords } from "./diffUtils.js";
import { C, btnSmall } from "./lib/theme.js";
import { ScanLines, Vignette, DeviceSelect, AudioLevelMeter } from "./lib/ui.jsx";
import { playTts, useAudioDevices, getAudioStream } from "./lib/audio.js";
import { FilePicker } from "./lib/FilePicker.jsx";
import { LibraryPanel } from "./lib/speechLibrary.jsx";
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

export default function Tutor({ library }) {
  const { speeches, activeId, adding, speech,
          addSpeech, cancelAdd, selectSpeech, openAdd, removeActive } = library;
  const [userText, setUserText]         = useState("");
  const [recognizedText, setRecognizedText] = useState("");
  const [language, setLanguage]         = useState("en");
  const [whisperModel, setWhisperModel] = useState("small");
  const [ttsPlaying, setTtsPlaying]     = useState(false);
  const [fontSize, setFontSize]         = useState(18);
  const [micGain, setMicGain]           = useState(1);
  const [volume, setVolume]             = useState(1);
  const [elapsed, setElapsed]           = useState(0);
  const [leftPct, setLeftPct]           = useState(58);
  const [topPct, setTopPct]             = useState(50);
  const [sentenceIdx, setSentenceIdx]   = useState(0);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);

  const { audioInputs, audioOutputs, selectedMic, setSelectedMic, selectedOutput, setSelectedOutput } = useAudioDevices();

  const mainRef          = useRef(null);
  const rightRef         = useRef(null);
  const ttsAbortRef      = useRef(null);
  const micBarRef        = useRef(null);
  const intervalRef      = useRef(null);
  const sentenceIdxRef   = useRef(0);

  const sentences = useMemo(() => {
    const matches = userText.match(/[^.!?]+[.!?]+/g);
    if (!matches) return userText.trim() ? [userText.trim()] : [];
    return matches.map(s => s.trim()).filter(Boolean);
  }, [userText]);

  // Word offset (in allWords) where each sentence starts
  const sentenceWordOffsets = useMemo(() => {
    const offsets = [0];
    for (let i = 0; i < sentences.length - 1; i++)
      offsets.push(offsets[i] + sentences[i].split(/\s+/).filter(Boolean).length);
    return offsets;
  }, [sentences]);

  // Tokens for karaoke view: alternating word/whitespace parts
  const textTokens = useMemo(() => {
    const parts = userText.split(/(\s+)/);
    let wordIdx = 0;
    return parts.map(part => ({ text: part, wordIdx: /\S/.test(part) ? wordIdx++ : -1 }));
  }, [userText]);

  // Reset position when text changes
  useEffect(() => {
    sentenceIdxRef.current = 0;
    setSentenceIdx(0);
    setActiveWordIdx(-1);
  }, [userText]);

  const getStream = useCallback(() => getAudioStream(selectedMic), [selectedMic]);

  const { listenState, start, stop } = useMicTranscription({
    language,
    model: whisperModel,
    selectedMic,
    micBarRef,
    getStream,
    silenceDurationMs: 300,
    micGain,
    onPartial: useCallback((text) => setRecognizedText(text), []),
    onFinal:   useCallback((text) => setRecognizedText(text), []),
    onError:   useCallback(() => {}, []),
  });

  const startListening = useCallback(async () => {
    setRecognizedText("");
    setElapsed(0);
    await start();
  }, [start]);

  const startTtsFrom = useCallback((idx) => {
    const text = sentences.slice(idx).join(" ").trim();
    if (!text) { setTtsPlaying(false); return; }
    const wordOffset = sentenceWordOffsets[idx] ?? 0;
    setTtsPlaying(true);
    setActiveWordIdx(wordOffset);
    ttsAbortRef.current = playTts(
      text, LANG_VOICES[language] ?? LANG_VOICES.en,
      () => { setTtsPlaying(false); setActiveWordIdx(-1); },
      selectedOutput || undefined,
      (_word, globalIdx) => setActiveWordIdx(wordOffset + globalIdx),
      volume,
    );
  }, [sentences, sentenceWordOffsets, language, selectedOutput, volume]);

  const stopTts = useCallback(() => {
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
    setActiveWordIdx(-1);
  }, []);

  // Load the active speech into the editable practice text; reset on selection change
  useEffect(() => {
    const plain = speech
      .filter(i => i.type === "line" || i.type === "bold" || i.type === "break")
      .map(i => i.type === "break" ? "" : i.text)
      .join("\n\n")
      .replace(/(\n\n){2,}/g, "\n\n");
    setUserText(plain);
    setRecognizedText("");
    stopTts();
  }, [activeId, speech, stopTts]);

  // Play pronunciation via TTS (toggle stop/start from current sentence)
  const playPronunciation = useCallback(() => {
    if (ttsPlaying) { stopTts(); setTtsPlaying(false); return; }
    startTtsFrom(sentenceIdxRef.current);
  }, [ttsPlaying, stopTts, startTtsFrom]);

  // Navigate by delta sentences: stop, move, restart
  const navigateSentence = useCallback((delta) => {
    const newIdx = Math.max(0, Math.min(sentences.length - 1, sentenceIdxRef.current + delta));
    sentenceIdxRef.current = newIdx;
    setSentenceIdx(newIdx);
    stopTts();
    startTtsFrom(newIdx);
  }, [sentences.length, stopTts, startTtsFrom]);

  // Hot-swap audio output device / volume during TTS playback
  useEffect(() => {
    const audio = ttsAbortRef.current?.audio;
    if (audio?.setSinkId && selectedOutput) {
      audio.setSinkId(selectedOutput);
    }
  }, [selectedOutput]);

  useEffect(() => {
    ttsAbortRef.current?.setVolume?.(volume);
  }, [volume]);

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

  // Timer: runs while actively listening or system is speaking
  useEffect(() => {
    if (listenState === "listening" || ttsPlaying) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => { clearInterval(intervalRef.current); intervalRef.current = null; };
  }, [listenState, ttsPlaying]);

  // Scroll active word into view while TTS is playing
  useEffect(() => {
    if (activeWordIdx < 0) return;
    document.querySelector("[data-active-word='true']")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeWordIdx]);

  const formatTime = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  if (!speeches.length || adding) {
    return <FilePicker onAdd={addSpeech} onCancel={adding ? cancelAdd : undefined} title={adding ? "Add a text" : undefined} submitLabel="ADD TO LIBRARY →" />;
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
      </div>

      {/* Main content: two-column layout + library panel */}
      <div style={{
        flex: 1, display: "flex", overflow: "hidden",
        zIndex: 3, position: "relative",
      }}>
      <div ref={mainRef} style={{
        flex: 1, display: "flex", overflow: "hidden",
        position: "relative",
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
            {ttsPlaying ? (
              <div style={{
                flex: 1, overflow: "auto", padding: "8px 16px 16px",
                fontSize, lineHeight: 1.6,
                fontFamily: "'EB Garamond', Georgia, serif",
                whiteSpace: "pre-wrap", wordWrap: "break-word",
                scrollbarWidth: "thin",
                scrollbarColor: `${C.amberDim} transparent`,
              }}>
                {textTokens.map((token, i) => {
                  if (token.wordIdx < 0) return <span key={i}>{token.text}</span>;
                  const isActive = token.wordIdx === activeWordIdx;
                  return (
                    <span
                      key={i}
                      data-active-word={isActive ? "true" : undefined}
                      style={{
                        color: isActive ? C.amber : C.text,
                        background: isActive ? `${C.amber}22` : "transparent",
                        borderRadius: 3,
                        padding: isActive ? "0 2px" : "0",
                        textShadow: isActive ? `0 0 10px ${C.amber}88` : "none",
                        transition: "all 0.08s",
                      }}
                    >
                      {token.text}
                    </span>
                  );
                })}
              </div>
            ) : (
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
            )}
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
      <LibraryPanel speeches={speeches} activeId={activeId} onSelect={selectSpeech} onRemove={removeActive} onAdd={openAdd} />
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

        {/* TTS navigation + play */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={() => navigateSentence(-1)}
            disabled={sentenceIdx === 0}
            title="Previous sentence"
            style={{
              ...btnSmall,
              padding: "7px 11px", fontSize: 14,
              opacity: sentenceIdx === 0 ? 0.3 : 1,
            }}
          >◀</button>

          <button onClick={playPronunciation} style={{
            ...btnSmall,
            background: ttsPlaying ? "rgba(30,180,110,0.15)" : "rgba(255,255,255,0.05)",
            color: ttsPlaying ? "#22cc66" : "rgba(255,255,255,0.45)",
            border: ttsPlaying ? "1px solid rgba(30,180,110,0.3)" : "1px solid rgba(255,255,255,0.08)",
            padding: "7px 16px", fontSize: 13, fontWeight: 700, letterSpacing: 1,
          }}>
            {ttsPlaying ? "◼ STOP" : "◉ SYSTEM SPEAK"}
          </button>

          <button
            onClick={() => navigateSentence(1)}
            disabled={sentenceIdx >= sentences.length - 1}
            title="Next sentence"
            style={{
              ...btnSmall,
              padding: "7px 11px", fontSize: 14,
              opacity: sentenceIdx >= sentences.length - 1 ? 0.3 : 1,
            }}
          >▶</button>

          {sentences.length > 0 && (
            <span style={{ color: C.textFaint, fontSize: 10, letterSpacing: 1, minWidth: 36, textAlign: "center" }}>
              {sentenceIdx + 1}/{sentences.length}
            </span>
          )}
        </div>

        <div style={{ width: 1, height: 24, background: C.divider }} />

        {/* Font size */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>SIZE</span>
          <button onClick={() => setFontSize(s => Math.max(FONT_MIN, s - FONT_STEP))} style={btnSmall}>A−</button>
          <span style={{ color: C.text, fontSize: 12, minWidth: 24, textAlign: "center" }}>{fontSize}</span>
          <button onClick={() => setFontSize(s => Math.min(FONT_MAX, s + FONT_STEP))} style={btnSmall}>A+</button>
        </div>

        <div style={{ width: 1, height: 24, background: C.divider }} />

        {/* Mic gain */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>GAIN</span>
          <input
            type="range" min={0} max={3} step={0.1}
            value={micGain} onChange={e => setMicGain(+e.target.value)}
            style={{ width: 80, accentColor: C.amber, cursor: "pointer" }}
          />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 700, minWidth: 32, textAlign: "right", letterSpacing: 1 }}>
            {micGain.toFixed(1)}×
          </span>
        </div>

        <div style={{ width: 1, height: 24, background: C.divider }} />

        {/* Volume */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: C.textFaint, fontSize: 11, letterSpacing: 2 }}>VOL</span>
          <input
            type="range" min={0} max={1} step={0.05}
            value={volume} onChange={e => setVolume(+e.target.value)}
            style={{ width: 80, accentColor: C.amber, cursor: "pointer" }}
          />
          <span style={{ color: C.text, fontSize: 13, fontWeight: 700, minWidth: 32, textAlign: "right", letterSpacing: 1 }}>
            {Math.round(volume * 100)}%
          </span>
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
