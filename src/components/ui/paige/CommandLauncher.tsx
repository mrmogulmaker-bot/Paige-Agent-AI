import { useState } from "react";
import { Send, PanelRightOpen } from "lucide-react";
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
 * passed in via `onAsk`. With no `onAsk` the launcher HONESTLY hands off to the full
 * session (expand the rail) rather than faking a send (§13) — so it is never a dead
 * end even before the chat is wired.
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

  const close = () => {
    setLauncherOpen(false);
    setQuery("");
  };

  const handleAsk = () => {
    const text = query.trim();
    if (text && onAsk) {
      onAsk(text);
    }
    // Whether or not the send is wired, continue in the full session (spec §9.2):
    // expand the rail so the conversation is visible. Honest — never a faked reply.
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
        placeholder={`Ask ${persona.label} anything…`}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {trimmed ? (
          <CommandGroup heading={persona.label}>
            <CommandItem
              value="ask"
              onSelect={handleAsk}
              className="gap-2"
            >
              <Send className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="truncate">
                Ask {persona.label}: <span className="text-muted-foreground">{trimmed}</span>
              </span>
            </CommandItem>
          </CommandGroup>
        ) : (
          <CommandEmpty>Type to ask {persona.label} — or open the full conversation.</CommandEmpty>
        )}
        <CommandGroup heading="Go to">
          <CommandItem value="open-conversation" onSelect={openFullConversation} className="gap-2">
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>Open the full conversation</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
