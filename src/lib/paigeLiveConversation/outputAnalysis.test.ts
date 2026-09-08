import { afterEach, describe, expect, it, vi } from "vitest";
import { observePlayedAudio } from "./outputAnalysis";

describe("actual played output analysis", () => {
  afterEach(() => vi.restoreAllMocks());
  function setup() {
    const audio = document.createElement("audio");
    Object.defineProperties(audio, { paused: { configurable: true, value: false }, readyState: { configurable: true, value: 3 } });
    const stop = vi.fn(), close = vi.fn(async () => undefined), disconnect = vi.fn();
    const stream = { getAudioTracks: () => [{}], getTracks: () => [{ stop }] };
    Object.assign(audio, { captureStream: () => stream });
    const analyser = { fftSize: 256, frequencyBinCount: 128, smoothingTimeConstant: 0,
      getByteTimeDomainData: (values: Uint8Array) => values.fill(160), getByteFrequencyData: (values: Uint8Array) => values.fill(80), disconnect };
    class Context {
      state = "running";
      createAnalyser = () => analyser;
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect });
      resume = vi.fn(async () => undefined);
      close = close;
    }
    vi.stubGlobal("AudioContext", Context);
    const changed = vi.fn();
    const observer = observePlayedAudio(audio, changed);
    return { audio, observer, changed, stop, close };
  }
  afterEach(() => vi.unstubAllGlobals());
  it("derives normalized energy from actual analyser samples, never text", () => {
    const { observer, changed, stop, close } = setup();
    expect(changed).toHaveBeenLastCalledWith(true);
    expect(observer.readEnergy()).toEqual({ amplitude: .75, brightness: 80 / 255 });
    observer.dispose();
    expect(observer.readEnergy().amplitude).toBe(0);
    expect(stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
  for (const event of ["pause", "ended", "error", "waiting", "emptied", "stalled"]) {
    it(`immediately removes speech energy on ${event}`, () => {
      const { audio, observer, changed } = setup();
      audio.dispatchEvent(new Event(event));
      expect(observer.readEnergy().amplitude).toBe(0);
      expect(changed).toHaveBeenLastCalledWith(false);
      observer.dispose();
    });
  }
  it("has no energy while muted, zero-volume, hidden or unsupported", () => {
    const { audio, observer } = setup();
    audio.muted = true;
    expect(observer.readEnergy().amplitude).toBe(0);
    audio.muted = false;
    audio.volume = 0;
    expect(observer.readEnergy().amplitude).toBe(0);
    observer.dispose();
    const unsupported = observePlayedAudio(document.createElement("audio"), vi.fn());
    expect(unsupported.readEnergy().amplitude).toBe(0);
    unsupported.dispose();
  });
});
