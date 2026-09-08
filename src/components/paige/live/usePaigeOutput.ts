import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { messageTts } from "@/lib/voice/messageTts";
import { observePlayedAudio } from "@/lib/paigeLiveConversation/outputAnalysis";
import { SILENT_ENERGY } from "@/lib/paigeLiveConversation/presence";

/** One output owner, no synthesis/network/provider shortcut. Only the active conversation's
 * actual playing message can drive this Presence. A realtime transport must join that same owner. */
export function usePaigeOutput(visible: boolean, messageIds: readonly string[]) {
  const snapshot = useSyncExternalStore(messageTts.subscribe, messageTts.getSnapshot, messageTts.getSnapshot);
  const [playing, setPlaying] = useState(false);
  const observer = useRef<ReturnType<typeof observePlayedAudio> | null>(null);
  const belongs = snapshot.activeId !== null && messageIds.includes(snapshot.activeId);
  // Keep the last owned output lease until stopped. A thread-change render must not turn old
  // session cleanup into a no-op, or let it stop a different conversation's newer output.
  const ownedId = useRef<string | null>(null);
  if (belongs) ownedId.current = snapshot.activeId;
  useEffect(() => {
    const audio = messageTts.getAudioElement();
    if (visible && belongs && snapshot.status === "playing" && audio) observer.current = observePlayedAudio(audio, setPlaying);
    else setPlaying(false);
    return () => { observer.current?.dispose(); observer.current = null; };
  }, [visible, belongs, snapshot.activeId, snapshot.status]);
  const readEnergy = useRef(() => observer.current?.readEnergy() ?? SILENT_ENERGY).current;
  const ownsCurrent = () => ownedId.current !== null && messageTts.getSnapshot().activeId === ownedId.current;
  return { playing: visible && belongs && playing, readEnergy,
    stop: () => { if (ownsCurrent()) messageTts.stop(); ownedId.current = null; },
    pause: () => { if (ownsCurrent()) messageTts.pause(); },
    resume: () => { if (ownsCurrent()) void messageTts.resume(); },
  };
}
