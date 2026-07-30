import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";
import { SecurityBadge } from "@/components/security/SecurityBadge";
import { PageHead } from "@/components/seo/PageHead";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title="Privacy Policy — PaigeAgent.ai"
        description="How PaigeAgent.ai collects, protects, and uses your account, client, and usage data. CCPA/CPRA compliant — written in plain English."
        path="/privacy"
      />
      <SiteBackground />
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
          <h1 className="text-4xl font-bold text-foreground">Privacy Policy</h1>
          <SecurityBadge />
        </div>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: July 26, 2026 — written in plain English. You should be able to read this in 5 minutes.
        </p>

        <div className="prose prose-sm max-w-none space-y-10 text-foreground/90">
          {/* 1 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">1. Who we are and what this covers</h2>
            <p>
              PaigeAgent AI is a client-management platform operated by{" "}
              <strong>PaigeAgent AI LLC</strong>, a Wyoming limited liability company. Paige helps
              coaches, consultants, agencies, thought leaders, and advisors run their practice —
              onboarding clients, managing relationships, following up, scheduling, and keeping the
              work moving. This Privacy Policy explains how we collect, use, protect, and{" "}
              <strong>never sell</strong> your information. It covers all data you and your team share
              with us — including your account details, the client and business records you store in
              the platform, and how you use Paige.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">2. What data we collect and why</h2>

            <h3 className="text-lg font-medium text-foreground mt-4">Account Data</h3>
            <p>
              Your name, email address, business name, and authentication credentials are used to
              manage your account, provision your workspace, and send you platform notifications. We
              do not sell or share this information with third parties for marketing purposes.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">Client &amp; CRM Data</h3>
            <p>
              When you run your practice on Paige you store records about your own clients and your
              work with them — contact details, notes, onboarding responses, tasks, follow-ups, and
              related history. This data belongs to you. We process it{" "}
              <strong>exclusively</strong> to provide the platform features you use, and we never
              sell it or share it with advertisers or data brokers.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">Usage Data</h3>
            <p>
              We collect anonymized data about how you use the platform — which features you visit,
              how often you interact with Paige — to improve the platform experience. This data is
              not linked to your client records for any purpose other than operating and improving
              the service.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">Voice Session Content</h3>
            <p>
              When you speak to Paige — dictating a message or talking on a call — your audio is
              streamed to a speech-to-text provider (Deepgram) to transcribe what you said, and the
              transcript is processed to understand your request and respond. When Paige replies
              aloud, your text is sent to a text-to-speech provider to generate the spoken audio.
              Voice content is used only to power the feature you invoked and is never sold or used
              for advertising.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">Calendar Data</h3>
            <p>
              If you connect a calendar, we collect the event and scheduling information needed to
              let Paige create, view, update, and manage the sessions and appointments you schedule
              through the platform. This data is used only for those scheduling features.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">3. How we protect your data</h2>
            <p>Your data is protected with enterprise-grade security:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>AES-256 encryption for all sensitive data at rest</li>
              <li>Role-based access controls ensuring only you and authorized PaigeAgent personnel can access your data</li>
              <li>Our infrastructure is built on Supabase, which is SOC 2 Type II certified</li>
              <li>Our AI provider Anthropic is SOC 2 Type II certified</li>
              <li>All data transmission uses TLS 1.3 encryption</li>
              <li>We maintain comprehensive audit logs of all access to your sensitive data</li>
              <li>Tenant data is isolated so one practice can never see another&apos;s records</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">4. How we use your data</h2>
            <p>We use your data exclusively for these purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Running the client-management features you use — onboarding, follow-ups, scheduling, and workflows</li>
              <li>Powering Paige so she can draft, suggest, and act on your behalf within your practice</li>
              <li>Sending you account and platform notifications</li>
              <li>Improving the quality and accuracy of the platform experience over time</li>
            </ul>
            <p className="mt-3 font-medium">We do NOT use your data for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Selling to advertisers or data brokers</li>
              <li>Targeted advertising</li>
              <li>Training generalized AI models on your client records</li>
              <li>Any purpose other than operating and improving the service you signed up for</li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">5. Data sharing</h2>
            <p>
              We share your data with these service providers <strong>only as necessary to operate
              the platform</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Anthropic</strong> (AI processing for Paige conversations) — subject to their SOC 2 certified data handling</li>
              <li><strong>Supabase</strong> (database and storage) — SOC 2 Type II certified</li>
              <li><strong>Stripe</strong> (payment processing) — PCI DSS Level 1 certified</li>
              <li><strong>Deepgram</strong> (speech-to-text for voice dictation and calls) — your voice audio and its transcript only</li>
              <li><strong>ElevenLabs</strong> (text-to-speech voice narration) — the reply text Paige speaks aloud only</li>
              <li><strong>Twilio</strong> (SMS notifications) — your phone number and notification content only</li>
            </ul>
            <p>
              We never share your data with nonaffiliated third parties for marketing or any purpose
              other than operating the platform services listed above.
            </p>
            <p>
              If you choose to connect an optional integration (for example, an accounting tool such
              as QuickBooks), your data is imported through that provider&apos;s official API and
              governed by their privacy terms. PaigeAgent does not share your data back to that
              provider or any other third party beyond what the integration requires.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">6. Your data rights</h2>
            <p>You have these rights regarding your data:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> Request a complete export of all data PaigeAgent holds about you.</li>
              <li><strong>Correction:</strong> Update or correct any data in your profile at any time through the app.</li>
              <li><strong>Deletion:</strong> Delete your account and all associated data through Settings → Data &amp; Privacy → Delete Account. Deletion is permanent and processed within 30 days.</li>
              <li><strong>Opt-out of data sharing:</strong> We do not share your data for marketing purposes. If this changes we will notify you and provide an opt-out before any sharing begins.</li>
              <li><strong>California residents:</strong> If you are a California resident you have additional rights under the CCPA/CPRA. Contact us at <strong>privacy@paigeagent.ai</strong> to exercise these rights.</li>
            </ul>
          </section>

          {/* 7 — SMS notifications */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">7. SMS notifications</h2>
            <p>
              Users may opt in to receive SMS notifications from Paige Agent AI LLC by providing
              their phone number and consent during signup. Msg &amp; data rates may apply. Reply STOP
              to unsubscribe. Reply HELP for support. This service is provided by Paige Agent AI LLC
              in accordance with US TCPA and CTIA guidelines.
            </p>
          </section>

          {/* 8 — Google API Services / Limited Use */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              8. Google user data — Limited Use disclosure
            </h2>
            <p>
              When you choose to connect your Google Calendar to PaigeAgent, we
              request the following OAuth scopes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <code>https://www.googleapis.com/auth/calendar.events.owned</code> — to
                create, update, view, and remove the calendar events you
                explicitly schedule through PaigeAgent on calendars you own
                (client sessions, milestone check-ins, appointment scheduling).
              </li>
              <li>
                <code>https://www.googleapis.com/auth/userinfo.email</code> — to
                identify which Google account is connected.
              </li>
            </ul>
            <p className="mt-3">
              <strong>Limited Use.</strong> PaigeAgent&apos;s use and transfer of
              information received from Google APIs to any other app adheres to
              the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Specifically:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>We use Google Calendar data <strong>only</strong> to provide user-facing scheduling features inside PaigeAgent.</li>
              <li>We do <strong>not</strong> sell Google user data.</li>
              <li>We do <strong>not</strong> transfer Google user data to third parties except as necessary to provide or improve the scheduling feature, comply with applicable law, or as part of a merger, acquisition, or asset sale with equivalent protections.</li>
              <li>We do <strong>not</strong> use Google user data for serving advertisements.</li>
              <li>We do <strong>not</strong> allow humans to read Google user data unless (a) you give explicit consent for a specific action, (b) it is necessary for security purposes such as investigating abuse, (c) it is required by law, or (d) the data is aggregated and used for internal operations in accordance with applicable privacy rules.</li>
              <li>We do <strong>not</strong> use Google user data to train, fine-tune, or improve generalized AI or machine-learning models.</li>
            </ul>
            <p>
              Calendar tokens are encrypted at rest using AES-256 and are only
              decrypted server-side to perform the Calendar actions you request.
              You can disconnect your Google Calendar at any time from{" "}
              <strong>Settings → Calendar → Disconnect</strong>, which
              immediately revokes PaigeAgent&apos;s access token and deletes all
              stored Google credentials.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">9. Contact and updates</h2>
            <p>
              <strong>Privacy questions:</strong> privacy@paigeagent.ai
              <br />
              <strong>Data deletion requests:</strong> privacy@paigeagent.ai or Settings →
              Data &amp; Privacy → Delete Account
              <br />
              <strong>Last updated:</strong> April 2026
            </p>
            <p>
              We will notify you by email of any material changes to this Privacy Policy before
              they take effect.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
