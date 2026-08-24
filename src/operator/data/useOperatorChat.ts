/**
 * ─── THE OPERATOR CHAT, WIRED TO THE ENGINE THAT ALREADY EXISTS (§18) ────────────────────────
 *
 * The defect this closes, found 2026-08-24 against the owner's side-by-side: the spine is a
 * fully-ported chat surface with NOTHING behind it. `OperatorSpine` takes `transcript` and
 * `onSend` as props and — correctly, per its own docblock — refuses to own an engine:
 *
 *   "NOT PORTED (§18, deliberately): any chat engine. The platform already has one. Nothing here
 *    stores a thread, sends a message, streams a token or calls a model."
 *
 * That was the right call and it was never finished. Nothing in `src/operator/` passed either
 * prop, so the operator could type into a live-looking composer and nothing happened — a control
 * that looks live and silently does nothing is the exact §13/§36 failure the doctrine names.
 *
 * This is the missing half: the caller. It does NOT reimplement the engine — it POSTs the same
 * `paige-ai-chat` seam the app and Studio chats already use, with the operator's own JWT.
 *
 * WHY THE OPERATOR PERSONA NEEDS NO ARGUMENT HERE (§52). `paige-ai-chat` composes the operator
 * briefing SERVER-side, gated on `is_platform_operator()` derived from the verified JWT — never
 * from anything a caller sends. So passing the operator's token is the whole of it: she opens
 * already briefed, and a tenant token through this same seam gets the tenant persona instead. A
 * client-supplied "I am the operator" flag would be a §588 hole; there is deliberately none.
 *
 * HONEST FAILURE (§13). A refused or broken stream lands in the transcript as a turn that says
 * what failed. It never disappears, and it never leaves a half-written answer looking complete.
 */
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SpineTurn } from "@/operator/shell/spine/spineContract";

/** The engine speaks OpenAI-shaped SSE: `data: {choices:[{delta:{content}}]}`, then `[DONE]`. */
const SSE_PREFIX = "data: ";

type EngineMessage = { role: "user" | "assistant"; content: string };

export type OperatorChat = {
  readonly transcript: readonly SpineTurn[];
  /** True while a turn is in flight — the composer disables itself rather than queueing. */
  readonly busy: boolean;
  readonly send: (text: string) => void;
};

/**
 * `who` follows the pack's own transcript fixture (L10831–L10837): the operator is `You`, she is
 * `Paige`. Not a label choice — a port.
 */
function turn(id: string, mine: boolean, body: string, extra: Partial<SpineTurn> = {}): SpineTurn {
  return { id, who: mine ? "You" : "Paige", mine, body, ...extra };
}

export function useOperatorChat(enabled: boolean = true): OperatorChat {
  const [transcript, setTranscript] = useState<readonly SpineTurn[]>([]);
  const [busy, setBusy] = useState(false);
  // The engine wants the whole exchange, and reading it off `transcript` would rebuild prose that
  // has already been styled. Kept separately so what is SENT stays exactly what was said.
  const history = useRef<EngineMessage[]>([]);
  const seq = useRef(0);

  const send = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!enabled || !body || busy) return;

      const mineId = `u${(seq.current += 1)}`;
      const hersId = `a${(seq.current += 1)}`;
      history.current = [...history.current, { role: "user", content: body }];

      setTranscript((prev) => [
        ...prev,
        turn(mineId, true, body),
        // Her turn opens EMPTY and streaming, which is what makes the caret honest: it is there
        // because tokens are actually arriving, not as decoration on a request that may fail.
        turn(hersId, false, "", { streaming: true }),
      ]);
      setBusy(true);

      void (async () => {
        const settle = (patch: Partial<SpineTurn>) =>
          setTranscript((prev) =>
            prev.map((t) => (t.id === hersId ? { ...t, streaming: false, ...patch } : t)),
          );

        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (!token) {
            settle({
              body: "You are not signed in any more, so nothing was sent. Sign in and say it again.",
              tone: "negative",
            });
            return;
          }

          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paige-ai-chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ messages: history.current }),
            },
          );

          if (!res.ok || !res.body) {
            // The status is named rather than swallowed — "something went wrong" is what sends
            // the next session guessing (§32: a failure must be loud).
            settle({
              body: `She could not be reached — the request came back ${res.status}. Nothing was sent.`,
              tone: "negative",
            });
            return;
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let answer = "";
          let buffered = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            // A chunk can split mid-line, so the tail is carried rather than parsed and lost —
            // dropping it silently truncates her answer in a way that still LOOKS complete.
            buffered += decoder.decode(value, { stream: true });
            const lines = buffered.split("\n");
            buffered = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith(SSE_PREFIX)) continue;
              const payload = line.slice(SSE_PREFIX.length).trim();
              if (payload === "[DONE]") continue;
              try {
                const piece = JSON.parse(payload)?.choices?.[0]?.delta?.content;
                if (typeof piece === "string" && piece) {
                  answer += piece;
                  setTranscript((prev) =>
                    prev.map((t) => (t.id === hersId ? { ...t, body: answer } : t)),
                  );
                }
              } catch {
                // One unparseable frame is not a failed answer; the stream carries on.
              }
            }
          }

          if (!answer.trim()) {
            settle({
              body: "The connection held but she sent nothing back. Nothing was saved.",
              tone: "negative",
            });
            return;
          }

          history.current = [...history.current, { role: "assistant", content: answer }];
          settle({ body: answer });
        } catch (e) {
          settle({
            body: `She could not be reached — ${e instanceof Error ? e.message : String(e)}. Nothing was sent.`,
            tone: "negative",
          });
        } finally {
          setBusy(false);
        }
      })();
    },
    [enabled, busy],
  );

  return { transcript, busy, send };
}
