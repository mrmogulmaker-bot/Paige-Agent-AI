import { useState } from "react";
import { Send, PanelRightOpen, Clock } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useAgentPresence } from "./AgentPresenceContext";
import type { AgentPersona } from "./persona";

/**
 * CommandLauncher — the universal ⌘K Paige launcher (Wave 4 Slice 4a.1).
 *
 * A focused Paige input over the CURRENT surface, reachable from any authenticated
 * surface (spec §5 "Every authenticated surface"; §36 power-user pattern). Escape
 * dismisses (owned by the underlying Radix dialog); the ⌘K keybinding lives in
 * {@link AgentPresenceProvider}. "Open the full conversation" hands off to the
 * right-rail (desktop) per spec §9.2.
 *
 * CHROME, not the chat (spec §11 non-goal): the actual "ask" send is the chat seam,
 * passed in via `onAsk`. Until that seam is wired (`onAsk` absent) the launcher does
 * NOT accept a text submission that would silently vanish (§13) — it shows an honest
 * "connecting soon" state instead of a fake "send" affordance, and still offers the
 * presence-rail handoff. Once `onAsk` lands, the real send item appears. So it is
 * never a dead end AND never a silent discard, even before the chat is wired.
 *
 * §11/§22/§25: built on the shared `command`/`dialog` primitives (no hand-rolled
 * modal), token-only, AA both themes. Motion is the primitives' own Radix animation,
 * neutralized under reduced-motion via the `motion-reduce:` guard on the surface (§22).
 */

export interface CommandLauncherProps {
  /** Resolved persona identity — frames the placeholder ("Ask {name}…"). */
  persona: AgentPersona;
  /**
   * The chat "ask" seam. Called with the typed text on submit. Absent = the launcher
   * hands off to the full session instead of faking a send (§13). Wired in a later slice.
   */
  onAsk?: (text: string) => void;
}

export function CommandLauncher({ persona, onAsk }: CommandLauncherProps) {
  const { launcherOpen, setLauncherOpen, expandRail } = useAgentPresence();
  const [query, setQuery] = useState("");

  // Is the real chat "ask" seam wired? Only then may we accept a text submission —
  // otherwise a typed message would silently vanish into an empty rail (§13).
  const wired = Boolean(onAsk);

  const close = () => {
    setLauncherOpen(false);
    setQuery("");
  };

  const handleAsk = () => {
    const text = query.trim();
    // Only reachable when wired (the send item is rendered only then). Guard anyway.
    if (!text || !onAsk) return;
    onAsk(text);
    // Continue in the full session (spec §9.2): expand the rail so the conversation is
    // visible. Honest — the message actually went to the seam, never a faked reply.
    expandRail();
    close();
  };

  const openFullConversation = () => {
    expandRail();
    close();
  };

  const trimmed = query.trim();

  return (
    <CommandDialog
      open={launcherOpen}
      onOpenChange={(open) => (open ? setLauncherOpen(true) : close())}
      // shouldFilter=false: this is an "ask anything" box, not a filtered command
      // list — the action items stay visible regardless of the free text.
      shouldFilter={false}
      title={`Ask ${persona.label}`}
      description={`Ask ${persona.label} from anywhere`}
      // §22 reduced-motion guard on the animated surface.
      className="motion-reduce:!animate-none motion-reduce:!transition-none"
    >
      <CommandInput
        placeholder={
          wired
            ? `Ask ${persona.label} anything…`
            : `${persona.label} connects here soon…`
        }
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {trimmed ? (
          wired ? (
            <CommandGroup heading={persona.label}>
              <CommandItem value="ask" onSelect={handleAsk} className="gap-2">
                <Send className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="truncate">
                  Ask {persona.label}: <span className="text-muted-foreground">{trimmed}</span>
                </span>
              </CommandItem>
            </CommandGroup>
          ) : (
            // NOT wired yet — an honest, non-actionable notice so the typed text is never
            // silently swallowed by a fake "send" (§13). `disabled` = Enter does nothing,
            // but the user is told why.
            <CommandGroup heading={persona.label}>
              <CommandItem value="ask-soon" disabled className="gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="truncate text-muted-foreground">
                  {persona.label}'s live conversation connects here soon — your message
                  isn't sent yet.
                </span>
              </CommandItem>
            </CommandGroup>
          )
        ) : (
          <CommandEmpty>
            {wired
              ? `Type to ask ${persona.label} — or open the full conversation.`
              : `${persona.label}'s live conversation connects here soon.`}
          </CommandEmpty>
        )}
        <CommandGroup heading="Go to">
          <CommandItem value="open-conversation" onSelect={openFullConversation} className="gap-2">
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>{wired ? "Open the full conversation" : "Open Paige's presence rail"}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
