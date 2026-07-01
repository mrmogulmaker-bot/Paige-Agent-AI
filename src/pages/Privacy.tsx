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
        description="How PaigeAgent.ai collects, protects, and uses your credit, banking, and business financial data. GLBA, FCRA, and CCPA/CPRA compliant — written in plain English."
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
          Last updated: April 2026 — written in plain English. You should be able to read this in 5 minutes.
        </p>

        <div className="prose prose-sm max-w-none space-y-10 text-foreground/90">
          {/* 1 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">1. Who we are and what this covers</h2>
            <p>
              PaigeAgent AI is a financial intelligence platform operated by{" "}
              <strong>PaigeAgent AI LLC</strong>, a Wyoming limited liability company. This Privacy
              Policy explains how we collect, use, protect, and <strong>never sell</strong> your
              financial information. It covers all data you share with us — including credit reports,
              banking information, business financial data, and personal financial profile information.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">2. What data we collect and why</h2>

            <h3 className="text-lg font-medium text-foreground mt-4">Credit Report Data</h3>
            <p>
              When you upload your credit report we extract your credit scores, account history,
              payment history, and negative items. We use this data <strong>exclusively</strong> to
              calculate your fundability scores and provide personalized credit coaching through
              Paige. We do not share your credit report data with any lender, advertiser, or third
              party without your explicit written consent.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">Banking Relationship Data</h3>
            <p>
              When you complete your Financial Profile or connect QuickBooks we collect your bank
              account information, average monthly balances, and account types. We use this data to
              improve the accuracy of your fundability scores and funding recommendations. This data
              is never shared with lenders or third parties.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">Business Financial Data</h3>
            <p>
              When you connect QuickBooks or enter business financial information we collect revenue
              data, expense patterns, and account balances. This data is used exclusively to provide
              more accurate business fundability scoring and funding recommendations.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">Identity and Account Data</h3>
            <p>
              Your name, email address, and authentication credentials are used to manage your
              account and send you platform notifications. We do not sell or share this information
              with third parties for marketing purposes.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-4">Usage Data</h3>
            <p>
              We collect anonymized data about how you use the platform — which features you visit,
              how often you interact with Paige — to improve the platform experience. This data is
              never linked to your personal financial information.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">3. How we protect your data</h2>
            <p>Your financial data is protected with bank-grade security:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>AES-256 encryption for all sensitive data including credit report information and Social Security Numbers</li>
              <li>Role-based access controls ensuring only you and authorized PaigeAgent personnel can access your data</li>
              <li>Our infrastructure is built on Supabase, which is SOC 2 Type II certified</li>
              <li>Our AI provider Anthropic is SOC 2 Type II certified</li>
              <li>All data transmission uses TLS 1.3 encryption</li>
              <li>We maintain comprehensive audit logs of all access to your sensitive data</li>
              <li>We never store your full credit report — only the extracted data points needed for your fundability analysis</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">4. How we use your data (permissible purposes)</h2>
            <p>We use your financial data exclusively for these purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Calculating your Personal, Small Business, and Commercial fundability scores</li>
              <li>Providing personalized credit and funding coaching through Paige AI</li>
              <li>Matching you with relevant funding products and lenders</li>
              <li>Sending you alerts about changes to your credit profile</li>
              <li>Improving the accuracy of your financial intelligence over time</li>
            </ul>
            <p className="mt-3 font-medium">We do NOT use your data for:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Selling to lenders, advertisers, or data brokers</li>
              <li>Targeted advertising</li>
              <li>Employment or insurance decisions</li>
              <li>Any purpose other than your direct financial intelligence service</li>
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
              <li><strong>ElevenLabs</strong> (voice processing for Paige voice sessions) — your voice session content only</li>
              <li><strong>Twilio</strong> (SMS notifications) — your phone number and notification content only</li>
            </ul>
            <p>
              We never share your financial data with nonaffiliated third parties for marketing,
              lending decisions, or any purpose other than operating the platform services listed
              above.
            </p>
            <p>
              If you connect QuickBooks your data is imported through Intuit's official API and
              governed by Intuit's privacy terms. PaigeAgent does not share your QuickBooks data
              back to Intuit or any third party.
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

          {/* 7 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">7. Credit report data — specific disclosure (FCRA)</h2>
            <p>
              When you upload your credit report to PaigeAgent you are providing it voluntarily for
              the exclusive purpose of receiving credit intelligence and funding advisory services.
              PaigeAgent uses your credit report data only for this permissible purpose. We do not:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Pull your credit report without your knowledge or consent</li>
              <li>Share your credit report data with lenders without your explicit consent</li>
              <li>Use your credit report data for employment, housing, or insurance decisions</li>
              <li>Retain raw credit report files — only extracted data points are stored</li>
            </ul>
            <p>
              Your credit report data is your property. You may request deletion of all credit data
              at any time.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">8. GLBA notice</h2>
            <p>
              PaigeAgent AI LLC provides financial intelligence services and may be subject to the
              Gramm-Leach-Bliley Act (GLBA). In accordance with GLBA we provide this notice: We
              collect nonpublic personal financial information to provide you with credit
              intelligence, fundability scoring, and funding advisory services. We do not sell or
              share this information with nonaffiliated third parties except as described in
              Section 5 above and as permitted by law. You have the right to opt out of certain
              information sharing by contacting us at <strong>privacy@paigeagent.ai</strong>.
            </p>
          </section>

          {/* 8.5 — Google API Services / Limited Use */}
          <section>
            <h2 className="text-2xl font-semibold text-foreground">
              8.5 Google user data — Limited Use disclosure
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
                (funding sessions, milestone check-ins, application deadlines).
              </li>
              <li>
                <code>https://www.googleapis.com/auth/userinfo.email</code> — to
                identify which Google account is connected.
              </li>
            </ul>
            <p className="mt-3">
              <strong>Limited Use.</strong> PaigeAgent's use and transfer of
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
              immediately revokes PaigeAgent's access token and deletes all
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
