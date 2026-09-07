/**
 * Geometry-only mount of the real shipped component and styles.
 * Synthetic transcript/card fixtures prove layout and state rendering only. The control seam always
 * returns PROOF OWED, requests no microphone, and performs no network/provider/database action.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PaigeLiveConversation } from "@/components/paige/live/PaigeLiveConversation";
import type { LiveConversationCard } from "@/lib/paigeLiveConversation/contract";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
const cardKind = params.get("card") ?? "plan";
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
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Dedicated Paige workspace · geometry harness</p>
        <div className="mt-5 flex items-end gap-3 rounded-xl border bg-background p-3">
          <textarea aria-label="Message Paige" className="min-h-12 flex-1 resize-none bg-transparent p-2" defaultValue="Help me review this plan." />
          <PaigeLiveConversation
            contextEpoch="fixture-tenant||fixture-workspace"
            threadId="00000000-0000-4000-8000-000000000002"
            ensureThread={async () => "00000000-0000-4000-8000-000000000002"}
            transcript={[
              { id: "one", role: "user", content: "Help me review our delivery plan." },
              { id: "two", role: "assistant", content: "I put the current Strategic Play on screen so we can work from the same record." },
            ]}
            activeCard={cards[cardKind] ?? cards.plan}
            working={false}
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

createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
