import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { PaigeWorkingSessionCard } from "@/solo/PaigeWorkingSessionCard";
import { DiscussionNeededCard } from "@/solo/DiscussionNeededCard";
import type { ChatRailApi } from "@/components/dashboard/PaigeAIChat";
import "@/index.css";
import "@/solo/solo-tokens.css";
import "@/solo/solo-paige-workspace.css";
import "@/solo/solo-game-plan-workspace.css";
import "./mount.css";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme") === "dark" ? "dark" : "light";
const surface = params.get("surface") === "discussion" ? "discussion" : "interview";
const initialThread = params.get("mode") === "offer" ? null : "33333333-3333-4333-8333-333333333333";

document.documentElement.setAttribute("data-pg", theme);
document.documentElement.classList.toggle("dark", theme === "dark");
document.documentElement.classList.toggle("light", theme === "light");

function Harness() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(initialThread);
  const api = useMemo<ChatRailApi>(() => ({
    threads: activeThreadId ? [{ id: activeThreadId, title: "Business working interview", created_at: "2026-09-07T12:00:00Z", updated_at: "2026-09-07T12:00:00Z", is_archived: false }] : [],
    isLoading: false,
    activeThreadId,
    streamingThreadId: null,
    onSelect: setActiveThreadId,
    onNewChat: () => setActiveThreadId(null),
    ensureActiveThread: async () => {
      const id = "33333333-3333-4333-8333-333333333333";
      setActiveThreadId(id);
      return id;
    },
    onRename: async () => {},
    onArchive: async () => {},
    onDelete: () => {},
    mobileOpen: false,
    onMobileOpenChange: () => {},
  }), [activeThreadId]);

  return (
    <main className="paige-solo intentful-harness">
      <div className="harness-label">HARNESS RENDER · NOT LIVE</div>
      {surface === "interview" ? (
        <section className="harness-workspace" aria-label="Dedicated Paige workspace">
          <header>
            <span><MessageSquareText aria-hidden size={18} /></span>
            <div><strong>Paige workspace</strong><small>Business working session</small></div>
            <em><ShieldCheck aria-hidden size={13} /> Governed actions</em>
          </header>
          <div className="harness-transcript">
            <PaigeWorkingSessionCard api={api} explicitOffer accountEpoch="tenant-a:user-a" />
          </div>
          <footer><textarea aria-label="Message Paige" placeholder="Message Paige…" /><button type="button">Send</button></footer>
        </section>
      ) : (
        <section className="harness-game-plan" aria-label="Business Game Plan Strategic Play">
          <div className="harness-breadcrumb">Business Game Plan / Strategic Play</div>
          <h1>Convert warm referrals</h1>
          <p>Turn three warm introductions into two qualified owner conversations.</p>
          <DiscussionNeededCard missionId="22222222-2222-4222-8222-222222222222" onTalkNow={() => { document.body.dataset.talkNow = "opened-paige"; }} />
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
