import { useState, useRef, useCallback, useEffect } from "react";
import { WS_MSG } from "./lib/transcription-protocol.js";

const SILENCE_THRESHOLD = 0.04;

/**
 * Manages WebSocket + MediaRecorder + silence detection for /api/transcribe.
 *
 * getStream: async () => MediaStream | { stream: MediaStream, onCleanup?: () => void }
 *   Return onCleanup to override default track-stopping (e.g. shared system-audio tracks).
 *
 * Returns { listenState, start, stop }
 */
export function useMicTranscription({
  language,
  model,
  selectedMic,         // watched — changing during "listening" swaps the stream
  micBarRef,           // ref to DOM level-bar element for direct updates
  getStream,
  silenceDurationMs = 300,
  vad = true,
  onPartial,
  onFinal,
  onError,
}) {
  const [listenState, setListenState] = useState("idle");

  const wsRef           = useRef(null);
  const recorderRef     = useRef(null);
  const streamRef       = useRef(null);
  const stopStreamRef   = useRef(null); // () => void — caller-provided stream teardown
  const analyserRef     = useRef(null);
  const levelRafRef     = useRef(null);
  const listenStateRef  = useRef("idle");

  useEffect(() => { listenStateRef.current = listenState; }, [listenState]);

  const stopLevelMeter = useCallback(() => {
    if (levelRafRef.current) cancelAnimationFrame(levelRafRef.current);
    levelRafRef.current = null;
    analyserRef.current?.ctx.close();
    analyserRef.current = null;
    if (micBarRef?.current) micBarRef.current.style.width = "0%";
  }, [micBarRef]);

  const startLevelMeter = useCallback((stream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = { ctx, analyser };
    let silenceStart = null;
    let pauseSent = false;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      const level = avg / 128;

      if (micBarRef?.current) {
        micBarRef.current.style.width = `${Math.min(100, level * 100)}%`;
        micBarRef.current.style.background =
          level > 0.7 ? "linear-gradient(to right, #22cc66, #ff4422)"
          : level > 0.4 ? "linear-gradient(to right, #22cc66, #ffaa22)"
          : "#22cc66";
        micBarRef.current.style.boxShadow =
          level > 0.3 ? "0 0 6px rgba(34,204,102,0.4)" : "none";
      }

      const now = performance.now();
      if (level < SILENCE_THRESHOLD) {
        if (silenceStart === null) silenceStart = now;
        const dur = now - silenceStart;
        if (!pauseSent && dur >= silenceDurationMs) {
          pauseSent = true;
          if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: WS_MSG.PAUSE_DETECTED }));
        }
      } else {
        silenceStart = null;
        pauseSent = false;
      }

      levelRafRef.current = requestAnimationFrame(tick);
    };
    levelRafRef.current = requestAnimationFrame(tick);
  }, [micBarRef, silenceDurationMs]);

  const attachRecorder = useCallback((stream, ws) => {
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recorderRef.current = recorder;
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0 && ws.readyState === WebSocket.OPEN)
        ws.send(ev.data);
    };
    recorder.start(1000);
  }, []);

  const resolveStream = useCallback(async () => {
    const result = await getStream();
    if (!result) return null;
    const stream = result instanceof MediaStream ? result : result.stream;
    const cleanup = result instanceof MediaStream
      ? () => stream.getTracks().forEach(t => t.stop())
      : (result.onCleanup ?? (() => stream.getTracks().forEach(t => t.stop())));
    streamRef.current = stream;
    stopStreamRef.current = cleanup;
    return stream;
  }, [getStream]);

  const releaseStream = useCallback(() => {
    stopStreamRef.current?.();
    stopStreamRef.current = null;
    streamRef.current = null;
  }, []);

  // Full teardown of recorder + stream + level meter (WS stays open)
  const cleanup = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recorderRef.current = null;
    releaseStream();
    stopLevelMeter();
  }, [releaseStream, stopLevelMeter]);

  const stop = useCallback(() => {
    const ws = wsRef.current;
    const recorder = recorderRef.current;

    stopLevelMeter();
    releaseStream();
    recorderRef.current = null;

    const sendStop = () => {
      if (ws?.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: WS_MSG.STOP }));
    };
    if (recorder?.state === "recording") {
      recorder.onstop = sendStop;
      recorder.stop();
    } else {
      sendStop();
    }
    setListenState("processing");
  }, [stopLevelMeter, releaseStream]);

  const start = useCallback(async () => {
    setListenState("starting");

    const stream = await resolveStream();
    if (!stream) { setListenState("idle"); return; }
    startLevelMeter(stream);

    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${wsProto}//${location.host}/api/transcribe`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: WS_MSG.START, language, model, vad }));
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === WS_MSG.READY) {
        setListenState("listening");
        attachRecorder(stream, ws);
      } else if (msg.type === WS_MSG.TRANSCRIPT) {
        if (msg.is_final) {
          setListenState("finished");
          ws.close();
          onFinal?.(msg.text);
        } else {
          onPartial?.(msg.text);
        }
      } else if (msg.type === WS_MSG.ERROR) {
        console.error("Transcription error:", msg.message);
        cleanup();
        setListenState("idle");
        onError?.(msg.message);
      }
    };

    let wsCleaned = false;
    const wsCleanup = () => {
      if (wsCleaned) return;
      wsCleaned = true;
      cleanup();
    };

    ws.onerror = () => { wsCleanup(); setListenState("idle"); onError?.(); };
    ws.onclose = () => { wsCleanup(); };
  }, [language, model, vad, resolveStream, startLevelMeter, attachRecorder, cleanup, onPartial, onFinal, onError]);

  // Hot-swap stream when selectedMic changes during listening.
  // Uses refs so the effect body never closes over stale callbacks.
  const resolveStreamRef = useRef(resolveStream);
  resolveStreamRef.current = resolveStream;
  const startLevelMeterRef = useRef(startLevelMeter);
  startLevelMeterRef.current = startLevelMeter;
  const attachRecorderRef = useRef(attachRecorder);
  attachRecorderRef.current = attachRecorder;
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;

  useEffect(() => {
    if (listenStateRef.current !== "listening" || !selectedMic) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    (async () => {
      cleanupRef.current();                           // stop old recorder/stream/meter
      const stream = await resolveStreamRef.current(); // acquire new stream
      if (!stream) return;
      startLevelMeterRef.current(stream);
      attachRecorderRef.current(stream, ws);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMic]);

  return { listenState, start, stop };
}
