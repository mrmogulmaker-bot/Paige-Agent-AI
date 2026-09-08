/**
 * Geometry-only mount of the real shipped component and styles.
 * Synthetic transcript/card fixtures prove layout and state rendering only. The control seam always
 * returns PROOF OWED, requests no microphone, and performs no network/provider/database action.
 */
import { StrictMode } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { PaigeLiveConversation } from "@/components/paige/live/PaigeLiveConversation";
import { PaigePresence } from "@/components/paige/live/PaigePresence";
import type { PresenceState } from "@/lib/paigeLiveConversation/presence";
import { messageTts } from "@/lib/voice/messageTts";
import type { LiveConversationCard } from "@/lib/paigeLiveConversation/contract";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
const cardKind = params.get("card") ?? "plan";
// Local audible test signal only, never provider speech. The real shared player and capture/analyser
// are exercised. No network, microphone, tenant row, model or provider call is involved.
Object.assign(window, { fixturePlay: async () => {
  const rate = 24000, length = rate * 8;
  const wav = new ArrayBuffer(44 + length * 2), view = new DataView(wav);
  const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) view.setInt16(44 + i * 2, Math.sin(i / rate * 2 * Math.PI * 220) * (.08 + .3 * Math.sin(i / rate * 3) ** 2) * 32767, true);
  await messageTts.toggle("two", async () => new Blob([wav], { type: "audio/wav" }));
}, fixtureStop: messageTts.stop });
document.documentElement.classList.toggle("dark", theme === "dark");
document.documentElement.classList.toggle("light", theme === "light");
document.documentElement.setAttribute("data-pg", theme);

const source = { availability: "LIVE" as const, provenanceLabel: "Canonical test fixture" };
const cards: Record<string, LiveConversationCard> = {
  question: { id: "question", kind: "question", title: "What outcome matters most this week?", placeholder: "Type an answer", source },
  choice: { id: "choice", kind: "choice", title: "Choose the next planning path", choices: [{ id: "one", label: "Protect delivery capacity" }, { id: "two", label: "Improve pipeline quality" }, { id: "three", label: "Review the current plan" }], source },
  plan: { id: "plan", kind: "plan", title: "Protect delivery capacity", body: "Current Strategic Play under discussion.", recordType: "strategic-play", statusLabel: "Owner-approved plan · review due Friday", source: { ...source, canonicalRef: "fixture:strategic-play" } },
  evidence: { id: "evidence", kind: "evidence-result", title: "Capacity review", body: "The current plan has two owner-confirmed delivery constraints.", resultLabel: "Available from the canonical plan fixture", source },
  action: { id: "action", kind: "governed-action", title: "Update the Strategic Play", body: "Paige is proposing a consequential plan revision.", action: { toolName: "business_mission.revise", authorityStatus: "confirmation-required", scopeSummary: "Revise only the fixture Strategic Play; no external action" }, source },
  recap: { id: "recap", kind: "recap", title: "Working-session recap", points: [{ id: "one", text: "Protect delivery capacity first", ownerConfirmed: true }, { id: "two", text: "Review pipeline quality next", ownerConfirmed: false }], source },
};

function Harness() {
  const [threadId, setThreadId] = useState<string | null>("00000000-0000-4000-8000-000000000002");
  const [turns, setTurns] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>(() => params.has("long")
    ? Array.from({ length: 30 }, (_, i) => ({ id: `fixture-${i}`, role: i % 2 ? "assistant" : "user", content: `Local conversation fixture ${i}. This is sufficient history to verify an exact reading anchor through streaming and window changes.` }))
    : [{ id: "one", role: "user", content: "Help me review our delivery plan." }, { id: "two", role: "assistant", content: "I put the current Strategic Play on screen so we can work from the same record." }]);
  Object.assign(window, {
    fixtureThread: setThreadId,
    fixtureAppend: () => setTurns((items) => [...items, { id: `fixture-${items.length}`, role: "assistant", content: "Local streamed continuation fixture." }]),
    fixtureRehydrate: () => setTurns((items) => items.map((item) => ({ ...item, id: `persisted-${item.id}` }))),
  });
  if (params.has("presence")) return <div className="bg-background text-foreground" style={{ minHeight: "100vh", display: "grid", placeContent: "center", justifyItems: "center" }}>
    <p>Isolated state fixture — no microphone or provider audio</p>
    <PaigePresence state={params.get("presence") as PresenceState} />
    <p>{params.get("presence")}</p>
  </div>;
  return (
    <div data-existing-popout-background className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Dedicated Paige workspace · geometry harness</p>
        <div className="mt-5 flex items-end gap-3 rounded-xl border bg-background p-3">
          <textarea aria-label="Message Paige" className="min-h-12 flex-1 resize-none bg-transparent p-2" defaultValue="Help me review this plan." />
          <PaigeLiveConversation
            contextEpoch="fixture-tenant||fixture-workspace"
            threadId={threadId}
            ensureThread={async () => "00000000-0000-4000-8000-000000000002"}
            transcript={turns}
            activeCard={cards[cardKind] ?? cards.plan}
            working={params.get("working") === "true"}
            workingLabel="No active work"
            confirmationFingerprints={cardKind === "action" ? ["fixture-fingerprint"] : []}
            onAnswer={() => undefined}
            onApprove={() => undefined}
            onDecline={() => undefined}
          />
        </div>
      </div>
    </div>
  );
}

function App() {
  const [popoutDocument, setPopoutDocument] = useState<Document | null>(null);
  if (params.get("host") !== "popout") return <Harness />;
  return <>
    <button type="button" onClick={() => {
      const child = window.open("", "paige-existing-chat-popout", "popup,width=960,height=760,resizable=yes");
      if (!child) return;
      child.document.title = "Existing Paige chat pop-out";
      child.document.head.replaceChildren(...Array.from(document.head.querySelectorAll('link[rel="stylesheet"],style')).map((node) => node.cloneNode(true)));
      child.document.documentElement.className = document.documentElement.className;
      child.document.body.replaceChildren();
      child.document.body.style.margin = "0";
      setPopoutDocument(child.document);
    }}>Open existing Paige pop-out</button>
    {popoutDocument ? createPortal(<Harness />, popoutDocument.body) : null}
  </>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
