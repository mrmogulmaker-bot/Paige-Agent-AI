import { SILENT_ENERGY, type AudioEnergy } from "./presence";

/** Analyze a capture of the audio actually playing. Never reroute the owner's playback through a
 * suspended AudioContext: unsupported capture/analysis degrades to silence in the visual only. */
export function observePlayedAudio(audio: HTMLAudioElement, onPlaying: (playing: boolean) => void) {
  type CaptureAudio = HTMLAudioElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let stream: MediaStream | null = null;
  let samples = new Uint8Array(0);
  let spectrum = new Uint8Array(0);
  let playing = false;
  let disposed = false;
  const audible = () => !audio.paused && !audio.ended && !audio.muted && audio.volume > 0 && audio.readyState >= 2;
  const clear = () => { playing = false; onPlaying(false); };
  const start = () => {
    if (disposed || !audible()) { clear(); return; }
    playing = true;
    onPlaying(true);
    if (context) { void context.resume().catch(() => undefined); return; }
    const capture = (audio as CaptureAudio).captureStream ?? (audio as CaptureAudio).mozCaptureStream;
    const view = audio.ownerDocument.defaultView as (Window & { AudioContext?: typeof AudioContext }) | null;
    if (!capture || !view?.AudioContext) return;
    try {
      stream = capture.call(audio);
      if (!stream.getAudioTracks().length) return;
      context = new view.AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = .15;
      source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      samples = new Uint8Array(analyser.fftSize);
      spectrum = new Uint8Array(analyser.frequencyBinCount);
      void context.resume().catch(() => undefined);
    } catch { /* Audio remains audible; unsupported analysis is never a fake waveform. */ }
  };
  const sync = () => { if (audible()) start(); else clear(); };
  const stops = ["pause", "ended", "error", "emptied", "waiting", "stalled"];
  audio.addEventListener("playing", start);
  audio.addEventListener("volumechange", sync);
  stops.forEach((event) => audio.addEventListener(event, clear));
  sync();
  return {
    readEnergy(): AudioEnergy {
      if (disposed || !playing || !audible() || audio.ownerDocument.hidden || !analyser || context?.state !== "running") return SILENT_ENERGY;
      analyser.getByteTimeDomainData(samples);
      analyser.getByteFrequencyData(spectrum);
      let sum = 0, high = 0;
      for (const value of samples) sum += ((value - 128) / 128) ** 2;
      for (let i = spectrum.length / 2; i < spectrum.length; i++) high += spectrum[i];
      return { amplitude: Math.min(1, Math.sqrt(sum / samples.length) * 3), brightness: Math.min(1, high / (spectrum.length / 2 * 255)) };
    },
    dispose() {
      disposed = true;
      clear();
      audio.removeEventListener("playing", start);
      audio.removeEventListener("volumechange", sync);
      stops.forEach((event) => audio.removeEventListener(event, clear));
      source?.disconnect();
      analyser?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close().catch(() => undefined);
    },
  };
}
