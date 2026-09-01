import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { SiteBackground } from "@/components/landing/SiteBackground";
import { PageHead } from "@/components/seo/PageHead";

const SmsTerms = () => (
  <div className="min-h-screen bg-background">
    <PageHead
      title="Messaging Terms — Paige Agent AI"
      description="Terms for Paige Agent AI account and service text messages."
      path="/sms-terms"
    />
    <SiteBackground />
    <Header />
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-bold text-foreground mb-2">Messaging Terms</h1>
      <p className="text-sm text-muted-foreground mb-10">Last updated: August 31, 2026</p>
      <div className="prose prose-sm max-w-none space-y-8 text-foreground/90">
        <section>
          <h2 className="text-2xl font-semibold text-foreground">Paige Agent AI account and service text messages</h2>
          <p>
            Paige Agent AI sends account and service text messages to users who choose to receive
            them. Messages may include workspace setup, account status, service availability, and
            notices requiring the account holder&apos;s attention.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">Consent and frequency</h2>
          <p>
            Message frequency varies. Message and data rates may apply. Consent is not a condition
            of purchase.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">Opt out and help</h2>
          <p>
            Reply STOP to opt out. After you opt out, no further messages will be sent unless you
            opt in again. Reply START or UNSTOP to opt in again. Reply HELP for help or email
            support@paigeagent.ai.
          </p>
          <p>Mobile carriers are not liable for delayed or undelivered messages.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-foreground">Related terms</h2>
          <p>
            See our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.
          </p>
        </section>
      </div>
    </main>
    <Footer />
  </div>
);

export default SmsTerms;
