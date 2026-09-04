import { TwilioComplianceEmbed } from "@twilio/twilio-compliance-embed";
import type { A2PEmbedSession } from "./data/useSoloA2PProvider";

export function A2PComplianceSession({ session, onSubmitted, onClose, onError }: {
  session: A2PEmbedSession;
  onSubmitted: (kind: "brand" | "campaign") => void;
  onClose: () => void;
  onError: () => void;
}) {
  return <div className="ss-a2p-embed" role="region" aria-label={`${session.kind} registration`}>
    <div className="ss-a2p-embed__bar">
      <div><strong>{session.kind === "brand" ? "Business and brand registration" : "Messaging campaign registration"}</strong>
        <span>Your answers go directly to Twilio&rsquo;s secure compliance flow.</span></div>
      <button type="button" className="ss-btn ss-btn--sm ss-btn--quiet" onClick={onClose}>Save and close</button>
    </div>
    <TwilioComplianceEmbed inquiryId={session.inquiryId} inquirySessionToken={session.token}
      onInquirySubmitted={() => onSubmitted(session.kind)} onComplete={onClose} onCancel={onClose}
      onError={onError} widgetPadding={{ top:16,left:16,right:16,bottom:16 }}/>
  </div>;
}
