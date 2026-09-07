import { useEffect, useRef, useState } from "react";
import { AlertTriangle, MessageCircle, TimerOff } from "lucide-react";
import { paigeDiscussionNeeded, type DiscussionNeeded } from "./data/paigeIntentfulInterview";

export function DiscussionNeededCard({
  missionId,
  onTalkNow,
}: {
  missionId: string;
  onTalkNow: (discussion: DiscussionNeeded) => void;
}) {
  const [discussion, setDiscussion] = useState<DiscussionNeeded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missionRef = useRef(missionId);
  missionRef.current = missionId;

  useEffect(() => {
    let current = true;
    setDiscussion(null);
    setError(null);
    void paigeDiscussionNeeded.get(missionId)
      .then((value) => { if (current) setDiscussion(value); })
      .catch(() => { if (current) setError("Discussion status could not be verified."); });
    return () => { current = false; };
  }, [missionId]);

  const respond = async (response: "talk_now" | "later" | "dont_ask_again") => {
    if (!discussion || busy) return;
    const requestedMission = missionId;
    setBusy(true); setError(null);
    try {
      await paigeDiscussionNeeded.respond(discussion.id, discussion.sourceRevision, response);
      if (missionRef.current !== requestedMission) return;
      if (response === "talk_now") onTalkNow(discussion);
      else setDiscussion(null);
    } catch {
      if (missionRef.current !== requestedMission) return;
      setDiscussion(null);
      try {
        const refreshed = await paigeDiscussionNeeded.get(requestedMission);
        if (missionRef.current !== requestedMission) return;
        setDiscussion(refreshed);
        setError(refreshed
          ? "This decision changed, so Paige refreshed it before you choose again."
          : "This discussion is no longer needed.");
      } catch {
        if (missionRef.current === requestedMission) setError("That choice could not be verified. Refresh this page before choosing again.");
      }
    } finally {
      if (missionRef.current === requestedMission) setBusy(false);
    }
  };

  if (!discussion && !error) return null;
  return (
    <section className="pim-discussion" aria-labelledby="pim-discussion-title">
      <div className="pim-discussion-head"><AlertTriangle aria-hidden /><div><small>DISCUSSION NEEDED</small><h4 id="pim-discussion-title">{discussion?.title ?? "Decision status unavailable"}</h4></div></div>
      {discussion && <><p><strong>Decision:</strong> {discussion.decision}</p><p>{discussion.reason} Paige will use your answer only to work on this selected Strategic Play.</p></>}
      {error && <p className="ov-err" role="alert">{error}</p>}
      {discussion && <div className="pim-discussion-actions">
        <button className="sd-btn sd-btn-sm sd-act" disabled={busy} onClick={() => void respond("talk_now")}><MessageCircle aria-hidden />Talk now</button>
        <button className="sd-btn sd-btn-sm" disabled={busy} onClick={() => void respond("later")}><TimerOff aria-hidden />Later</button>
        <button className="sd-btn sd-btn-sm" disabled={busy} onClick={() => void respond("dont_ask_again")}>Don’t ask again</button>
      </div>}
    </section>
  );
}
