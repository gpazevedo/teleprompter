import { describe, it, expect } from "vitest";
import { pickMic, TAB_AUDIO_ID } from "./audio.js";

const tab = { deviceId: TAB_AUDIO_ID, label: "Tab audio" };
const headset = { deviceId: "h1", label: "USB Headset" };
const builtIn = { deviceId: "b1", label: "Built-in Audio Analog Stereo" };

describe("pickMic", () => {
  it("keeps the previous mic while it is connected", () => {
    expect(pickMic([tab, headset, builtIn], "h1")).toBe("h1");
  });

  it("falls back to the built-in mic when the previous one is gone", () => {
    expect(pickMic([tab, builtIn], "h1")).toBe("b1");
  });

  it("prefers the built-in mic on first load", () => {
    expect(pickMic([tab, headset, builtIn], "")).toBe("b1");
  });

  it("uses the first real mic when no built-in mic exists", () => {
    expect(pickMic([tab, headset], "gone")).toBe("h1");
  });

  it("skips speaker monitor sources", () => {
    const monitor = { deviceId: "m1", label: "Monitor of Built-in Audio Analog Stereo" };
    expect(pickMic([tab, monitor, builtIn], "")).toBe("b1");
  });

  it("returns empty when there are no mics", () => {
    expect(pickMic([tab], "")).toBe("");
  });
});
