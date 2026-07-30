// messageTts — the ONE controller for per-message chat voice playback (#131). §18: a single
// shared HTMLAudioElement + one playing message at a time, so starting a new message ALWAYS stops
// the prior one (no overlapping voices), no matter which message button was clicked.
//
// It exposes a tiny external store (subscribe/getSnapshot) so every MessageAudioButton reflects the
// same live state via useSyncExternalStore. It owns NO React state itself and NO network code — the
// caller passes a `fetchAudio` that returns the mp3 Blob (paige-tts streams it), keeping this module
// framework-agnostic and the auth/URL concerns at the call site.
//
// HONEST degrade (§13): a `tts_not_configured` code from the endpoint flips a workspace-level
// `needsConfig` flag — every button then shows the disabled/needs-config state (playback is a
// workspace capability, not a per-message one), never a broken/silent button.

export type TtsStatus = "idle" | "loading" | "playing";

export interface TtsSnapshot {
  /** The message id currently loading or playing, else null. */
  activeId: string | null;
  status: TtsStatus;
  /** True once the endpoint reported the workspace has no TTS configured — disables all buttons. */
  needsConfig: boolean;
}

/** The result a caller's fetcher must throw on failure so we can distinguish needs-config. */
export interface TtsFetchError {
  needsConfig?: boolean;
  code?: string | null;
  message?: string;
}

type Listener = () => void;

class MessageTtsController {
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private snapshot: TtsSnapshot = { activeId: null, status: "idle", needsConfig: false };
  private listeners = new Set<Listener>();
  /** Monotonic token so a stale in-flight fetch can't resurrect playback after a newer start/stop. */
  private token = 0;

  subscribe = (cb: Listener): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): TtsSnapshot => this.snapshot;

  private emit(next: Partial<TtsSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const cb of this.listeners) cb();
  }

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const a = new Audio();
    a.onended = () => this.reset();
    a.onerror = () => this.reset();
    this.audio = a;
    return a;
  }

  private revoke() {
    if (this.objectUrl) {
      try { URL.revokeObjectURL(this.objectUrl); } catch { /* noop */ }
      this.objectUrl = null;
    }
  }

  private reset() {
    this.revoke();
    this.emit({ activeId: null, status: "idle" });
  }

  /** Stop any current playback/loading and clear state. */
  stop = () => {
    this.token++;
    if (this.audio) {
      try { this.audio.pause(); this.audio.currentTime = 0; } catch { /* noop */ }
    }
    this.reset();
  };

  /**
   * Toggle-aware play: if `id` is already the active (loading/playing) message, stop it. Otherwise
   * stop whatever is current, mark `id` loading, run `fetchAudio` to get the mp3 Blob, then play it.
   * A `needsConfig` error flips the workspace flag (all buttons disable); any other error stops and
   * calls `onError` so the caller can toast.
   */
  toggle = async (
    id: string,
    fetchAudio: () => Promise<Blob>,
    onError?: (e: TtsFetchError) => void,
  ): Promise<void> => {
    if (this.snapshot.activeId === id && this.snapshot.status !== "idle") {
      this.stop();
      return;
    }
    // Starting a new one always stops the prior — no overlapping voices.
    this.stop();
    const myToken = ++this.token;
    this.emit({ activeId: id, status: "loading" });
    try {
      const blob = await fetchAudio();
      if (myToken !== this.token) return; // superseded by a newer start/stop
      const url = URL.createObjectURL(blob);
      this.revoke();
      this.objectUrl = url;
      const a = this.ensureAudio();
      a.src = url;
      await a.play();
      if (myToken !== this.token) { this.stop(); return; }
      this.emit({ activeId: id, status: "playing" });
    } catch (e) {
      if (myToken !== this.token) return;
      const err = (e ?? {}) as TtsFetchError;
      if (err.needsConfig) this.emit({ activeId: null, status: "idle", needsConfig: true });
      else this.reset();
      onError?.(err);
    }
  };
}

export const messageTts = new MessageTtsController();
