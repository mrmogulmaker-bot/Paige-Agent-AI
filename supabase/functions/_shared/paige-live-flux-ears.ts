/** Live ears adapter. The Deepgram socket itself remains in the ONE STT home. */
import { extractDeepgramFluxTurn, openDeepgramSocket, planSttStream } from "./stt-router.ts";

export interface FluxEarsEvents {
  startOfTurn(text: string, turnIndex: number): void;
  partial(text: string, turnIndex: number): void;
  final(text: string, turnIndex: number): void;
  unavailable(): void;
}

export interface FluxEars {
  sendPcm(bytes: ArrayBuffer): number | null;
  close(): void;
}

export type FluxEarsOpenResult =
  | { ok: true; ears: FluxEars }
  | { ok: false; code: "stt_not_configured" | "stt_open_failed" };

/**
 * Opens Flux only through stt-router. Browser PCM is 16 kHz mono linear16.
 * An opener can be injected only by a local no-network harness; production uses
 * openDeepgramSocket, which reasserts mip_opt_out=true at the wire boundary.
 */
export async function openFluxEars(
  events: FluxEarsEvents,
  options: { opener?: (url: string) => WebSocket | null; openTimeoutMs?: number } = {},
): Promise<FluxEarsOpenResult> {
  const plan = planSttStream("flux-realtime", { encoding: "linear16", sampleRate: 16_000 });
  if (!plan.ok) return { ok: false, code: "stt_not_configured" };
  const socket = (options.opener ?? openDeepgramSocket)(plan.url);
  if (!socket) return { ok: false, code: "stt_not_configured" };

  let closedByRelay = false;
  let failed = false;
  let lastSequence = -1;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  const failOnce = () => {
    if (failed || closedByRelay) return;
    failed = true;
    events.unavailable();
  };

  const opened = await new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(openTimer);
      resolve(value);
    };
    const openTimer = setTimeout(() => {
      try { socket.close(1011, "stt_open_timeout"); } catch { /* already closed */ }
      settle(false);
    }, options.openTimeoutMs ?? 5000);
    socket.onopen = () => settle(true);
    socket.onerror = () => { failOnce(); settle(false); };
    socket.onclose = () => { if (closeTimer) clearTimeout(closeTimer); failOnce(); settle(false); };
    socket.onmessage = (message) => {
      if (failed || closedByRelay) return;
      const turn = extractDeepgramFluxTurn(message.data);
      if (!turn || turn.sequenceId <= lastSequence) return;
      lastSequence = turn.sequenceId;
      if (turn.event === "StartOfTurn") events.startOfTurn(turn.transcript, turn.turnIndex);
      else if (turn.isFinal) events.final(turn.transcript, turn.turnIndex);
      else if (turn.event === "Update") events.partial(turn.transcript, turn.turnIndex);
    };
  });
  if (!opened) return { ok: false, code: "stt_open_failed" };

  return {
    ok: true,
    ears: {
      sendPcm(bytes) {
        if (failed || closedByRelay || socket.readyState !== WebSocket.OPEN ||
          bytes.byteLength < 2 || bytes.byteLength > 32_000 || bytes.byteLength % 2 !== 0) return null;
        try {
          socket.send(bytes);
          return Math.round(bytes.byteLength / 2 / 16_000 * 1000);
        } catch {
          failOnce();
          return null;
        }
      },
      close() {
        if (closedByRelay) return;
        closedByRelay = true;
        if (socket.readyState === WebSocket.OPEN) {
          try { socket.send(JSON.stringify({ type: "CloseStream" })); } catch { /* best effort */ }
          closeTimer = setTimeout(() => {
            if (socket.readyState !== WebSocket.CLOSED) socket.close(1000, "relay_end");
          }, 1000);
        } else if (socket.readyState !== WebSocket.CLOSED) {
          try { socket.close(1000, "relay_end"); } catch { /* already closed */ }
        }
      },
    },
  };
}
