import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";
import { PageHead } from "@/components/seo/PageHead";

const Privacy = () => (
  <div className="min-h-screen bg-background">
    <PageHead
      title="Privacy Policy — Paige Agent AI"
      description="How Paige Agent AI collects, uses, and shares personal information."
      path="/privacy"
    />
    <SiteBackground />
    <Header />
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-foreground mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: August 31, 2026</p>
      <div className="prose prose-sm max-w-none space-y-10 text-foreground/90">
        <section>
          <h2 className="text-2xl font-semibold text-foreground">1. Scope</h2>
          <p>
            This Privacy Policy describes how Paige Agent AI collects, uses, and shares personal
            information when you visit paigeagent.ai, create an account, or use the Paige Agent AI
            service.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">2. Information we collect</h2>
          <p>
            We may collect account information such as your name, email address, mobile number,
            authentication information, business information, service preferences, and records you
            choose to store in the service. We also collect technical and usage information needed
            to operate, secure, support, and improve the service.
          </p>
          <p>
            When you connect an optional service, we receive the information and permissions needed
            to provide that integration. You can disconnect supported integrations through the
            applicable account settings or provider controls.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">3. How we use information</h2>
          <p>We use personal information to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Create, authenticate, and support accounts and workspaces.</li>
            <li>Provide requested features, communications, integrations, and customer support.</li>
            <li>Maintain service reliability, security, and operational records.</li>
            <li>Comply with applicable legal obligations and enforce our agreements.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">4. Text messaging information</h2>
          <p>
            If you opt in, Paige Agent AI may send account and service text messages to the mobile
            number you provide. Message frequency varies. Message and data rates may apply. Reply
            STOP to opt out or HELP for help.
          </p>
          <p>
            No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Information sharing to subcontractors in support services, such as customer service, is permitted. All other use case categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">5. Service providers and disclosure</h2>
          <p>
            We use service providers to host and operate the service, process payments, deliver
            communications, provide connected features, and support users. They receive information
            only as needed to perform services for us and are subject to their contractual and legal
            obligations. We may also disclose information when required by law, to protect rights
            and safety, or in connection with a corporate transaction subject to applicable law.
          </p>
          <p>We do not sell text messaging opt-in data or consent.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">6. Data choices</h2>
          <p>
            You may update supported account information and communication preferences through the
            service. You may request access, correction, or deletion by contacting
            privacy@paigeagent.ai. Some information may be retained where required for security,
            fraud prevention, legal compliance, dispute resolution, or other legitimate purposes.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">7. Security and retention</h2>
          <p>
            We use administrative, technical, and organizational measures intended to protect
            information. No system can guarantee absolute security. We retain information for as
            long as reasonably necessary for the purposes described here and as required by law.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">8. Google API data</h2>
          <p>
            Paige Agent AI&apos;s use and transfer of information received from Google APIs adheres
            to the Google API Services User Data Policy, including the Limited Use requirements.
            Google user data is used to provide the user-facing connected feature, is not sold, is
            not used for advertising, and is not used to train generalized AI models.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">9. Contact and updates</h2>
          <p>
            Privacy questions: privacy@paigeagent.ai<br />
            General support: support@paigeagent.ai
          </p>
          <p>We may update this policy and will post the revised date on this page.</p>
        </section>
      </div>
    </main>
    <Footer />
  </div>
);

export default Privacy;
