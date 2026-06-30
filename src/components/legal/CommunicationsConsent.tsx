// src/components/legal/CommunicationsConsent.tsx
// Reusable communications consent block for public forms.
// TCPA / CAN-SPAM compliant: marketing checkboxes are unchecked by default,
// transactional messages are disclosed but not "opt-in" (implied by account use).
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "react-router-dom";

export type CommsConsentState = {
  emailMarketing: boolean;
  smsMarketing: boolean;
  smsTransactional: boolean;
};

export const EMPTY_COMMS_CONSENT: CommsConsentState = {
  emailMarketing: false,
  smsMarketing: false,
  smsTransactional: false,
};

type Props = {
  value: CommsConsentState;
  onChange: (next: CommsConsentState) => void;
  /** When true, shows the SMS section. Hide when no phone is collected on the form. */
  showSms?: boolean;
  className?: string;
};

export function CommunicationsConsent({
  value,
  onChange,
  showSms = true,
  className,
}: Props) {
  const set = <K extends keyof CommsConsentState>(k: K, v: CommsConsentState[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div
      className={
        "rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-sm " +
        (className ?? "")
      }
    >
      <p className="text-xs text-muted-foreground leading-relaxed">
        We'll send you transactional emails about your account, security, and onboarding —
        these are required while your account is active. The boxes below are optional and
        give us permission to reach you on other channels. You can change these any time
        from your profile, or by replying STOP to any text message.
      </p>

      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox
          checked={value.emailMarketing}
          onCheckedChange={(c) => set("emailMarketing", c === true)}
          className="mt-0.5"
        />
        <span className="text-sm leading-snug">
          <strong>Email me</strong> product updates, educational content, and program
          announcements. (Unsubscribe link in every email.)
        </span>
      </label>

      {showSms && (
        <>
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={value.smsTransactional}
              onCheckedChange={(c) => set("smsTransactional", c === true)}
              className="mt-0.5"
            />
            <span className="text-sm leading-snug">
              <strong>Text me</strong> service and onboarding messages (appointment
              reminders, status, security codes). Msg &amp; data rates may apply. Reply
              STOP to opt out.
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={value.smsMarketing}
              onCheckedChange={(c) => set("smsMarketing", c === true)}
              className="mt-0.5"
            />
            <span className="text-sm leading-snug">
              <strong>Text me</strong> occasional promotional messages and program
              announcements. <em>Not a condition of any purchase.</em> Msg frequency
              varies. Reply STOP to opt out, HELP for help.
            </span>
          </label>
        </>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed pt-1 border-t border-border">
        By continuing, you also acknowledge our{" "}
        <Link to="/legal/communications-consent" className="underline" target="_blank">
          Communications Consent
        </Link>
        , <Link to="/privacy" className="underline" target="_blank">Privacy Policy</Link>,
        and <Link to="/terms" className="underline" target="_blank">Terms of Service</Link>.
      </p>
    </div>
  );
}
