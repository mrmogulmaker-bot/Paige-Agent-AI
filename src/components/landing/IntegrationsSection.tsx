// Public-facing Integrations section — explicitly discloses which third-party
// services PaigeAgent connects to and WHY. Required for Google OAuth
// verification (sensitive Calendar scopes) and reinforces trust for other
// providers we've already wired up.

import { Calendar, CreditCard, FileSpreadsheet, MessageSquare } from "lucide-react";

const INTEGRATIONS = [
  {
    icon: Calendar,
    title: "Google Calendar",
    purpose:
      "With your permission, PaigeAgent connects to your Google Calendar so coaches and clients can schedule funding sessions, milestone check-ins, and application deadlines without leaving the platform. We request the calendar.events and calendar.readonly scopes solely to read your availability and create the events you approve. Your calendar data is never sold, shared, or used to train AI models, and you can disconnect at any time from Settings.",
    scopes: "calendar.events, calendar.readonly, userinfo.email",
  },
  {
    icon: FileSpreadsheet,
    title: "QuickBooks (Intuit)",
    purpose:
      "Optional. When you connect QuickBooks, PaigeAgent reads revenue, expense, and account-balance data to improve the accuracy of your business fundability score. We do not write back to your books.",
    scopes: "com.intuit.quickbooks.accounting (read-only)",
  },
  {
    icon: CreditCard,
    title: "Stripe",
    purpose:
      "Processes subscription payments and manages tier upgrades. PaigeAgent never sees or stores your full card number.",
    scopes: "Payment processing only",
  },
  {
    icon: MessageSquare,
    title: "Twilio & Resend",
    purpose:
      "Deliver transactional SMS and email (credit alerts, session reminders, password resets). Only your phone number, email, and message content are shared.",
    scopes: "Notifications only",
  },
];

export function IntegrationsSection() {
  return (
    <section
      id="integrations"
      className="py-20 px-4 sm:px-6 lg:px-8 bg-background"
    >
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 mb-4">
            <span className="text-xs font-medium text-accent tracking-wide uppercase">
              Integrations &amp; Data Use
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
            What we connect to — and why
          </h2>
          <p className="text-base text-muted-foreground mt-3 max-w-2xl mx-auto">
            PaigeAgent only requests access to third-party services when a feature
            requires it. Every integration below is opt-in, disclosed in plain
            English, and can be disconnected from your account settings at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {INTEGRATIONS.map(({ icon: Icon, title, purpose, scopes }) => (
            <div
              key={title}
              className="rounded-xl border border-border/60 bg-card p-6 hover:border-accent/40 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                {purpose}
              </p>
              <p className="text-xs text-muted-foreground/80">
                <span className="font-medium text-foreground/70">Scopes / access:</span>{" "}
                {scopes}
              </p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10 max-w-3xl mx-auto">
          PaigeAgent's use and transfer of information received from Google APIs
          adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-accent/80"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. For details on how each data
          type is protected, see our{" "}
          <a href="/privacy" className="text-accent underline underline-offset-2 hover:text-accent/80">
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </section>
  );
}
