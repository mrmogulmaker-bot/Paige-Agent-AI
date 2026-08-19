import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { PaigeAIChat } from "@/components/dashboard/PaigeAIChat";

/**
 * "Ask Paige" — the operator console's slide-out chat (CD `Super Admin Shell.dc.html`
 * 2285–2361, opened by the header's ✦ at line 263).
 *
 * OWNER RULING A (2026-08-19): "Add a Paige chat button in top-right, next to the
 * crescent-moon theme toggle. Click → panel slides in from RIGHT edge, OVER surface
 * content (does NOT push content, does NOT shrink main viewport)… Persistent thread —
 * connects to the main Paige chat's threading, does NOT fork." That is also exactly what
 * the pack's own footer promises: "Same brain as the Paige tab — one thread, two doors."
 *
 * §30/§58 — THE PACK'S PANEL IS A PICTURE; THE ENGINE IS REAL. CD draws a transcript, a
 * composer, chips, an attach control and a Send button — and every one of those is a
 * styled div with NO handler (its Send, its chips, its ◍/◉ are all no-op stubs; its
 * composer is a <span> of placeholder text, not an input). Shipping that markup would
 * repeat the exact failure `src/operator/CLAUDE.md` records as #3: a beautiful dead
 * surface where a working capability already exists. So the pack's CHROME renders here —
 * its 430px width, its scrim, its slide-in, its header, its memory strip, its footer
 * line — wrapped around the REAL `PaigeAIChat` engine, which brings its own composer,
 * chips, voice, attachments, artifacts and streaming.
 *
 * §18 ONE HOME — the panel does NOT draw a thread rail (`renderRail={() => null}`). The
 * Paige branch owns the chat list; a second list here would be the duplicate-chrome
 * defect that same file records as #4. And because both doors are handed the SAME
 * controlled `activeThreadId`, they are two views of one conversation, never two
 * conversations.
 *
 * §11/§23 — CD's violet (#7C6CE0 → #4A3FA0) resolves to `--primary`, the mapping the
 * ported `OperatorPanel` anchor strip already uses; no raw hex ships, and it holds in
 * both themes. Gold stays on the act (the composer's Send, inside the engine), never on
 * this chrome.
 */
export default function OperatorPaigePanel({
  open,
  onOpenChange,
  surfaceLabel,
  threadId,
  onThreadIdChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The surface she can see — CD's `where`, e.g. "Systems Check". */
  surfaceLabel: string;
  /** The shared selection. `null` = no thread yet; both doors read the same value. */
  threadId: string | null;
  onThreadIdChange: (id: string | null) => void;
}) {
  const navigate = useNavigate();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-label="Ask Paige"
        /* CD: width:min(430px,100%); the scrim + slide-in come from the Sheet primitive.
           `[&>button]:hidden` drops the primitive's own corner ✕ — the pack puts close in
           the header row beside ⌸ and ⤢, and two ✕ would be duplicate chrome (§18). */
        className="flex w-[430px] max-w-full flex-col gap-0 p-0 [&>button]:hidden"
      >
        {/* ── header (CD 2290–2305) ──────────────────────────────────────── */}
        <div className="flex flex-none items-center gap-2.5 border-b border-border bg-muted/30 px-4 py-3">
          <span
            aria-hidden
            className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-[linear-gradient(150deg,hsl(var(--primary)/0.85),hsl(var(--primary)))] text-[11px] text-primary-foreground"
          >
            ✦
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold">Ask Paige</div>
            <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
              On {surfaceLabel} · she can see what you can
            </div>
          </div>
          <div className="ml-auto flex flex-none items-center gap-[7px]">
            <button
              type="button"
              title="Watch her build in the sandbox"
              aria-label="Watch her build in the sandbox"
              onClick={() => {
                onOpenChange(false);
                navigate("/operator/paige/sandbox");
              }}
              className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-border bg-card text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden>⌸</span>
            </button>
            <button
              type="button"
              title="Open the full thread"
              aria-label="Open the full thread"
              onClick={() => {
                onOpenChange(false);
                navigate("/operator/paige/chat");
              }}
              className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-border bg-card text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden>⤢</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close the side chat"
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden>✕</span>
            </button>
          </div>
        </div>

        {/* ── the engine, wearing CD's operator chrome ─────────────────────
             `conversationHeader` carries the pack's memory strip; `composerFootNote`
             carries its footer line verbatim. Both are real seams on the chat, so
             neither is a second copy of anything (§18). */}
        <div className="flex min-h-0 flex-1 flex-col">
          <PaigeAIChat
            presentation="operator"
            platform
            enableHistory
            fill
            hideHeader
            renderRail={() => null}
            activeThreadId={threadId}
            onActiveThreadIdChange={onThreadIdChange}
            composerFootNote="Same brain as the Paige tab — one thread, two doors."
            conversationHeader={
              <div className="flex min-w-0 flex-none items-center gap-[7px] border-b border-border bg-[hsl(var(--primary)/0.05)] px-4 py-2">
                <span aria-hidden className="flex-none text-[10px] text-[hsl(var(--primary))]">
                  ◆
                </span>
                <span className="min-w-0 text-[10.5px] leading-[1.4] text-[hsl(var(--primary))]">
                  This thread writes to her memory. Anything you rule here becomes a decision she
                  keeps.
                </span>
              </div>
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
