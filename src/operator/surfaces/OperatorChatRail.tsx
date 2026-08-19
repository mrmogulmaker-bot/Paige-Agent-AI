import { useMemo, useState } from "react";
import type { ChatRailApi } from "@/components/dashboard/PaigeAIChat";
import { cn } from "@/lib/utils";

/**
 * The operator console's 236px chat rail — Claude Design's own markup (Super Admin
 * Shell.dc.html, the `isWorkspace` block), now driven by the REAL live thread state
 * via `ChatRailApi` instead of the caller's own empty stand-in list.
 *
 * This is the fix for the exact defect the owner found (§30): the console used to
 * mount CD's drawn rail as static chrome AND the real chat's own `ThreadRail`
 * side-by-side, so the screen carried two "New chat" buttons and two chat lists.
 * There is now exactly one rail — CD's shape, real data, real handlers — passed to
 * `PaigeAIChat`'s `renderRail` seam (§18/§21).
 *
 * §13 — PROJECTS has no backing concept in `usePaigeThreads` (threads are flat,
 * never grouped). Porting the pack's PROJECTS section as empty ("No projects yet.")
 * is honest structure-without-data, not a stand-in — the same rule the rest of this
 * console already follows.
 */
export function OperatorChatRail({ api }: { api: ChatRailApi }) {
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [q, setQ] = useState("");

  const needle = q.trim().toLowerCase();
  const matches = (title: string | null) => !needle || (title ?? "").toLowerCase().includes(needle);

  // CD's two buckets: today's chats, and everything older — collapsing the app
  // chrome's finer Yesterday/Previous-7-days split into the pack's simpler EARLIER.
  const { today, earlier } = useMemo(() => {
    const DAY = 86_400_000;
    const now = Date.now();
    const t: typeof api.threads = [];
    const e: typeof api.threads = [];
    for (const th of api.threads) {
      const ts = th.last_message_at
        ? new Date(th.last_message_at).getTime()
        : th.updated_at
          ? new Date(th.updated_at).getTime()
          : 0;
      (now - ts < DAY ? t : e).push(th);
    }
    return { today: t, earlier: e };
    // `api` is a fresh object every render (PaigeAIChat builds it inline) — depending
    // on it wholesale would defeat the memo every render. Only `api.threads` changing
    // is what should re-bucket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.threads]);

  const shownToday = today.filter((t) => matches(t.title));
  const shownEarlier = earlier.filter((t) => matches(t.title));
  const chatCount = api.threads.length;
  const railFoot = chatCount === 0 ? "— chats · — projects" : `${chatCount} ${chatCount === 1 ? "chat" : "chats"} · — projects`;

  return (
    <div className="hidden w-[236px] flex-none flex-col gap-[9px] lg:flex">
      <button
        type="button"
        onClick={api.onNewChat}
        className="flex flex-none items-center gap-2 rounded-[10px] bg-cd-gold px-3 py-[9px] text-[12.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden className="text-[11px]">＋</span>New chat
      </button>

      <div className="flex min-w-0 flex-none items-center gap-2 rounded-[10px] border border-border bg-card px-[11px] py-[7px]">
        <span aria-hidden className="flex-none text-[11px] text-muted-foreground">⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search your chats"
          placeholder="Search your chats"
          className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden pr-0.5">
        {/* PROJECTS — no real grouping concept exists yet (§13: honest, not invented). */}
        <div>
          <button
            type="button"
            onClick={() => setFoldersOpen((o) => !o)}
            aria-expanded={foldersOpen}
            className="flex w-full items-center gap-[7px] rounded-[6px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">PROJECTS</span>
            <span aria-hidden className="ml-auto text-[9px] text-muted-foreground">{foldersOpen ? "▾" : "▸"}</span>
          </button>
          {foldersOpen && (
            <div className="mt-[7px] flex flex-col gap-[3px]">
              <p className="px-[9px] text-[10.5px] leading-relaxed text-muted-foreground">No projects yet.</p>
            </div>
          )}
        </div>

        {/* TODAY */}
        <div>
          <div className="text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">TODAY</div>
          <div className="mt-[7px] flex flex-col gap-0.5">
            {api.isLoading && (
              <p className="px-[9px] text-[10.5px] leading-relaxed text-muted-foreground">Loading…</p>
            )}
            {!api.isLoading && shownToday.length === 0 && (
              <p className="px-[9px] text-[10.5px] leading-relaxed text-muted-foreground">
                {today.length === 0 ? "Nothing today." : "Nothing matches that."}
              </p>
            )}
            {!api.isLoading &&
              shownToday.map((t) => {
                const on = t.id === api.activeThreadId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => api.onSelect(t.id)}
                    className={cn(
                      "min-w-0 rounded-lg border-l-2 px-[9px] py-[7px] text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-l-cd-gold bg-muted" : "border-l-transparent hover:bg-muted/60",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-[7px]">
                      <span className={cn("min-w-0 truncate text-[11.5px]", on ? "font-semibold" : "font-medium")}>
                        {t.title?.trim() || "Untitled chat"}
                      </span>
                      {t.id === api.streamingThreadId && (
                        <span aria-label="Live" className="flex-none text-[9px] text-[hsl(var(--success))]">●</span>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* EARLIER */}
        {earlier.length > 0 && (
          <div>
            <div className="text-[9px] font-semibold tracking-[0.15em] text-muted-foreground">EARLIER</div>
            <div className="mt-[7px] flex flex-col gap-0.5">
              {shownEarlier.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-current={t.id === api.activeThreadId ? "true" : undefined}
                  onClick={() => api.onSelect(t.id)}
                  className="min-w-0 rounded-lg px-[9px] py-[7px] text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0 truncate text-[11.5px]">{t.title?.trim() || "Untitled chat"}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-none items-center gap-[7px] border-t border-border pt-2">
        <span className="min-w-0 truncate text-[10.5px] text-muted-foreground">{railFoot}</span>
      </div>
    </div>
  );
}
