// FirstRunOnboarding — the ONE guided first-run surface for Conversations (§36 intuitiveness).
//
// Before a tenant has a single thread, the inbox used to show two disconnected empty boxes
// (a left-rail "No conversations yet." and a middle-pane "Your unified inbox.") with no story.
// This is the single cohesive panel that replaces them for the genuine zero-state: it teaches
// WHAT the surface is (every client conversation, one inbox), the draft-first / one-click-approve
// model (§36: Paige drafts, you approve), and offers ONE honest primary next step that branches
// on whether a sendable channel exists yet (§13 — never a dead-end CTA).
//
// §11 first-run/hero exception: a first-run empty state is one of the few places a richer treatment
// is earned — but still token-only, on the @/components/ui/page primitives, gold ONLY on the act,
// AA both themes, motion guarded by useReducedMotion. Pure presentational — no data, no side effects.
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Inbox, MessageCircle, Sparkles, Check, Plus, PlugZap } from "lucide-react";
import { SectionCard, GlyphPlate } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The three-beat mental model (§36 draft-first + one-click-approve), spoken in the
// coach's language — clients/conversations only, never finance/credit (§2), never
// "AI-powered"/"seamless"/"streamline" (§3).
const STEPS: { icon: typeof MessageCircle; title: string; body: string }[] = [
  {
    icon: MessageCircle,
    title: "A client reaches out",
    body: "Email, SMS, every channel your clients use — each one lands here as a single thread per person, so nothing slips.",
  },
  {
    icon: Sparkles,
    title: "Paige drafts the reply",
    body: "The moment a message arrives, Paige writes the response in your voice and sets it ready for you.",
  },
  {
    icon: Check,
    title: "You approve — it sends",
    body: "Read the draft, approve with one click, and it's on its way. You stay in control of every word.",
  },
];

export function FirstRunOnboarding({
  canCompose,
  onCompose,
  connectHref,
  className,
}: {
  /** True when a sendable (email/SMS) channel is connected — gates the primary act (§13). */
  canCompose: boolean;
  /** Opens the new-conversation composer. Called only when canCompose is true. */
  onCompose: () => void;
  /** The real connect-a-channel destination (reused from the existing disabled CTA). */
  connectHref: string;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("grid min-h-0 flex-1 place-items-center overflow-y-auto p-4", className)}>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="w-full max-w-2xl"
      >
        <SectionCard padded={false} className="overflow-hidden">
          <div className="px-6 py-9 text-center sm:px-10 sm:py-11">
            {/* Hero glyph — the embossed indigo plate, the platform's one depth motif. */}
            <div className="flex justify-center">
              <GlyphPlate icon={Inbox} size="lg" ring="indigo" />
            </div>

            <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-foreground">
              Every client conversation, one inbox.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
              This is where every message from every client comes together — one thread per person,
              with Paige drafting the reply and you approving it.
            </p>

            {/* The three-beat model — one raised panel (the sanctioned base→card→raised step),
                not three nested cards. Left-aligned bodies; numbered indigo badges carry order. */}
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/60 text-left sm:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.title} className="flex flex-col gap-2.5 bg-muted/40 p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold tabular-nums text-primary-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <step.icon className="h-4 w-4 text-primary" aria-hidden />
                  </div>
                  <p className="text-sm font-semibold leading-tight text-foreground">{step.title}</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
                </div>
              ))}
            </div>

            {/* ONE honest primary next step. Gold is the act (§11): starting a conversation when a
                channel is live, OR connecting the channel that unlocks the inbox when none is. */}
            <div className="mt-8 flex flex-col items-center gap-3">
              {canCompose ? (
                <>
                  <Button variant="gold" size="lg" onClick={onCompose}>
                    <Plus className="mr-1.5 h-4 w-4" /> Start a conversation
                  </Button>
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                    Or just wait — the moment a client reaches out, their thread appears here on its own.
                  </p>
                </>
              ) : (
                <>
                  <Button variant="gold" size="lg" asChild>
                    <Link to={connectHref}>
                      <PlugZap className="mr-1.5 h-4 w-4" /> Connect a channel
                    </Link>
                  </Button>
                  <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                    Connect an email or SMS channel to send from here. Inbound messages will start
                    landing in this inbox automatically once a channel is live.
                  </p>
                </>
              )}
            </div>
          </div>
        </SectionCard>
      </motion.div>
    </div>
  );
}
